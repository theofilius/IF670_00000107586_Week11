import { supabase } from "@/lib/supabase";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Button,
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import MapView, { Marker, Region, UrlTile } from "react-native-maps";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type PhotoData = {
  id?: string;
  latitude: number;
  longitude: number;
  image_url: string;
  created_at?: string;
};

const { height } = Dimensions.get("window");

export default function App() {
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string>("image/jpeg");
  const [isLoading, setIsLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoData[]>([]);

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = async (): Promise<void> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied! Please allow location access.");
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    setLocation({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });
  };

  const handleMapPress = (event: any) => {
    setLocation(event.nativeEvent.coordinate);
  };

  const handleMarkerDragEnd = (event: any) => {
    setLocation(event.nativeEvent.coordinate);
  };

  const pickImage = async (): Promise<void> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      setPhotoMimeType(asset.mimeType ?? "image/jpeg");
    }
  };

  const takePicture = async (): Promise<void> => {
    const cameraPermission = await ImagePicker.getCameraPermissionsAsync();
    if (!cameraPermission.granted) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera permission denied!");
        return;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      setPhotoMimeType(asset.mimeType ?? "image/jpeg");
    }
  };

  const uploadPhotoToSupabase = async (): Promise<void> => {
    if (!photoUri || !location) {
      Alert.alert("Please take a photo and ensure location is available!");
      return;
    }

    setIsLoading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: "base64",
      });
      const photoArrayBuffer = decodeBase64(base64);

      // Generate a unique filename
      const extension = photoMimeType.split("/")[1] ?? "jpg";
      const filename = `photo-${Date.now()}.${extension}`;
      const filepath = `camera/${filename}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(filepath, photoArrayBuffer, {
          contentType: photoMimeType,
        });

      if (uploadError) {
        Alert.alert("Upload Error", uploadError.message);
        setIsLoading(false);
        return;
      }

      // Get the public URL
      const { data: publicUrlData } = supabase.storage
        .from("images")
        .getPublicUrl(filepath);

      // Insert photo data into the database
      const { error } = await supabase
        .from("photo")
        .insert([
          {
            latitude: location.latitude,
            longitude: location.longitude,
            image_url: publicUrlData.publicUrl,
          },
        ])
        .select();

      if (error) {
        Alert.alert("Database Error", error.message);
        setIsLoading(false);
        return;
      }

      Alert.alert("Success", "Photo uploaded successfully!");
      setPhotoUri(null);
      setPhotoMimeType("image/jpeg");
      // Refresh photo list
      fetchPhotos();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPhotos = async (): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from("photo")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error("Fetch error:", error);
        return;
      }

      setPhotos(data || []);
    } catch (error: any) {
      console.error("Fetch error:", error.message);
    }
  };

  const region: Region | undefined = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : undefined;

  return (
    <ScrollView style={[styles.container, { backgroundColor: "#fff" }]}>
      {!location ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Getting location...</Text>
          <ActivityIndicator size="large" color="#0000ff" />
        </View>
      ) : (
        <>
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              initialRegion={region}
              onPress={handleMapPress}
              mapType="none"
            >
              <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker
                coordinate={location}
                title="My Location"
                draggable
                onDragEnd={handleMarkerDragEnd}
              />
            </MapView>
          </View>

          <View style={styles.info}>
            <Text style={styles.infoText}>
              Latitude: {location.latitude.toFixed(6)}
            </Text>
            <Text style={styles.infoText}>
              Longitude: {location.longitude.toFixed(6)}
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <Button title="Refresh Location" onPress={getLocation} />
            <Button
              title="Take Picture"
              onPress={takePicture}
              color="#4CAF50"
            />
            <Button
              title="Pick from Library"
              onPress={pickImage}
              color="#2196F3"
            />
          </View>

          {photoUri && (
            <View style={styles.previewContainer}>
              <Text style={styles.previewLabel}>Preview:</Text>
              <Image source={{ uri: photoUri }} style={styles.previewImage} />
              <Button
                title={isLoading ? "Uploading..." : "Upload Photo"}
                onPress={uploadPhotoToSupabase}
                disabled={isLoading}
                color="#FF9800"
              />
            </View>
          )}

          {photos.length > 0 && (
            <View style={styles.photosListContainer}>
              <Text style={styles.photosTitle}>Recent Photos:</Text>
              {photos.map((photo) => (
                <View key={photo.id} style={styles.photoItem}>
                  <Image
                    source={{ uri: photo.image_url }}
                    style={styles.photoThumbnail}
                  />
                  <View style={styles.photoInfo}>
                    <Text style={styles.photoCoords}>
                      Lat: {photo.latitude.toFixed(4)}
                    </Text>
                    <Text style={styles.photoCoords}>
                      Lon: {photo.longitude.toFixed(4)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const decodeBase64 = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    height: 200,
  },
  loadingText: {
    fontSize: 16,
    marginBottom: 10,
  },
  mapContainer: {
    height: height * 0.4,
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  map: {
    flex: 1,
  },
  info: {
    padding: 16,
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  infoText: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: "500",
  },
  buttonContainer: {
    padding: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  previewContainer: {
    padding: 16,
    backgroundColor: "#f9f9f9",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  previewImage: {
    width: "100%",
    height: 250,
    borderRadius: 8,
    marginBottom: 16,
    resizeMode: "contain",
  },
  photosListContainer: {
    padding: 16,
  },
  photosTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  photoItem: {
    flexDirection: "row",
    marginBottom: 12,
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
  },
  photoInfo: {
    flex: 1,
    justifyContent: "center",
  },
  photoCoords: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
});
