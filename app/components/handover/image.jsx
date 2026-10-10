import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../../services/api";
import useAuthStore from "../../../store/authStore";

export default function HandoverImageScreen() {
  const router = useRouter();
  const { handoverId, resume } = useLocalSearchParams();
  const { token } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState({});

  const [uploading, setUploading] = useState({});

  const [customerPhoto, setCustomerPhoto] = useState(null);
  const [customerWithCar, setCustomerWithCar] = useState(null);
  const [customerProfileImage, setCustomerProfileImage] = useState(null);
  const [frontImage, setFrontImage] = useState(null);
  const [rightImage, setRightImage] = useState(null);
  const [rearImage, setRearImage] = useState(null);
  const [leftImage, setLeftImage] = useState(null);
  const [idFrontImage, setIdFrontImage] = useState(null);
  const [idBackImage, setIdBackImage] = useState(null);

  // Driving License — optional for now
  const [dlFrontImage, setDlFrontImage] = useState(null);
  const [dlBackImage, setDlBackImage] = useState(null);

  // Toolkit & Spare Tyre — optional
  const [toolkitImage, setToolkitImage] = useState(null);
  const [spareTyreImage, setSpareTyreImage] = useState(null);

  // Odometer & Fuel Gauge — optional
  const [odometerImage, setOdometerImage] = useState(null);
  const [fuelGaugeImage, setFuelGaugeImage] = useState(null);

  // Interior & Roof Top — optional
  const [interiorImage, setInteriorImage] = useState(null);
  const [roofTopImage, setRoofTopImage] = useState(null);

  // Optional close-up damage photos: [{ id, uri, uploading, url }]
  const [damageImages, setDamageImages] = useState([]);

  useEffect(() => {
    fetchSavedImages();
  }, [handoverId, token]);
  const fetchSavedImages = async () => {
    try {
      const finalHandoverId = Array.isArray(handoverId)
        ? handoverId[0]
        : handoverId;

      if (!finalHandoverId || !token) {
        return;
      }

      const res = await api.get(`/handover/images/${finalHandoverId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const images = res?.data?.data?.images || {};

      // Keep all uploaded URLs in state
      setUploadedUrls(images);

      // Restore normal image previews
      setCustomerPhoto(images.customerPhoto || null);

      setCustomerProfileImage(images.customerProfileImage || null);

      setCustomerWithCar(images.customerWithVehicle || null);

      setIdFrontImage(images.idCardFront || null);

      setIdBackImage(images.idCardBack || null);

      setFrontImage(images.vehicleFront || null);

      setRearImage(images.vehicleRear || null);

      setLeftImage(images.vehicleLeft || null);

      setRightImage(images.vehicleRight || null);

      // Optional images
      setDlFrontImage(images.drivingLicenseFront || null);

      setDlBackImage(images.drivingLicenseBack || null);

      setToolkitImage(images.toolkit || null);

      setSpareTyreImage(images.spareTyre || null);

      setOdometerImage(images.odometer || null);

      setFuelGaugeImage(images.fuelGauge || null);

      setInteriorImage(images.interior || null);

      setRoofTopImage(images.roofTop || null);

      // Restore damage images
      if (Array.isArray(images.damageImages)) {
        setDamageImages(
          images.damageImages.map((url, index) => ({
            id: `saved-${index}-${Date.now()}`,
            uri: url,
            uploading: false,
            url,
          })),
        );
      }
    } catch (error) {
      console.log("FETCH SAVED IMAGES ERROR:", error?.response?.data?.message || error?.message);
    }
  };

  const pickImage = async (setter, key) => {
    if (uploading[key]) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Camera permission is required");
      return;
    }

    let result;
    try {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.4,
        allowsEditing: false,
      });
    } catch (error) {
      console.log("CAMERA ERROR:", error?.message);
      Alert.alert("Camera Error", "Unable to open camera. Please try again.");
      return;
    }

    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri;
    if (!uri) {
      Alert.alert("Error", "No image was captured. Please try again.");
      return;
    }

    try {
      await uploadImage(uri, key);
      setter(uri);
    } catch (error) {
      Alert.alert(
        "Upload Failed",
        error?.response?.data?.message || "Please try again.",
      );
    }
  };

  const uploadImage = async (imageUri, key) => {
    try {
      setUploading((prev) => ({
        ...prev,
        [key]: true,
      }));

      // 1. Upload image to Cloudinary
      const formData = new FormData();

      formData.append("image", {
        uri: imageUri,
        name: `${key}.jpg`,
        type: "image/jpeg",
      });

      const res = await api.post("/handover/image", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000,
      });

      const uploadedUrl = res?.data?.data?.url;

      if (!uploadedUrl) {
        throw new Error("Upload response missing image URL");
      }

      // 2. Keep URL in React state
      setUploadedUrls((prev) => ({
        ...prev,
        [key]: uploadedUrl,
      }));

      // 3. IMMEDIATELY save URL to MongoDB
      const finalHandoverId = Array.isArray(handoverId)
        ? handoverId[0]
        : handoverId;

      if (!finalHandoverId) {
        throw new Error("Handover ID missing");
      }

      await api.put(
        `/handover/save-single-image/${finalHandoverId}`,
        {
          key,
          url: uploadedUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      // 4. Return URL
      return uploadedUrl;
    } catch (error) {
      console.log("UPLOAD ERROR:", error?.message);
      throw error;
    } finally {
      setUploading((prev) => ({
        ...prev,
        [key]: false,
      }));
    }
  };

  // Take one damage close-up, upload it immediately, add it to the list.
  // Can be tapped repeatedly to add as many damage photos as needed.
  const addDamageImage = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Camera permission is required");
      return;
    }

    let result;
    try {
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        allowsEditing: false,
      });
    } catch (error) {
      console.log("CAMERA ERROR:", error?.message);
      Alert.alert("Camera Error", "Unable to open camera. Please try again.");
      return;
    }

    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri;
    if (!uri) {
      Alert.alert("Error", "No image was captured. Please try again.");
      return;
    }

    const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setDamageImages((prev) => [
      ...prev,
      { id: localId, uri, uploading: true, url: null },
    ]);

    try {
      const formData = new FormData();
      formData.append("image", {
        uri,
        name: `damage-${localId}.jpg`,
        type: "image/jpeg",
      });

      const res = await api.post("/handover/image", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000,
      });

      const uploadedUrl = res?.data?.data?.url;
      if (!uploadedUrl) {
        throw new Error("Upload response missing image URL");
      }

      setDamageImages((prev) =>
        prev.map((img) =>
          img.id === localId
            ? { ...img, uploading: false, url: uploadedUrl }
            : img,
        ),
      );
    } catch (error) {
      console.log("DAMAGE UPLOAD ERROR:", error?.message);
      setDamageImages((prev) => prev.filter((img) => img.id !== localId));
      Alert.alert(
        "Upload Failed",
        error?.response?.data?.message || "Please try again.",
      );
    }
  };

  const removeDamageImage = (id) => {
    setDamageImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleSubmit = async () => {
    try {
      const finalHandoverId = Array.isArray(handoverId)
        ? handoverId[0]
        : handoverId;

      if (!finalHandoverId) {
        Alert.alert("Error", "Handover ID missing");
        return;
      }
      if (Object.values(uploading).some(Boolean)) {
        return Alert.alert("Please wait", "Images are still uploading.");
      }
      if (damageImages.some((img) => img.uploading)) {
        return Alert.alert("Please wait", "Damage photos are still uploading.");
      }
      if (!token) {
        Alert.alert("Session expired", "Please login again");
        return;
      }

      // NOTE: drivingLicenseFront / drivingLicenseBack / toolkit / spareTyre
      // are intentionally NOT checked here — all four are optional for now.
      if (
        !uploadedUrls.customerPhoto ||
        !uploadedUrls.customerProfileImage ||
        !uploadedUrls.customerWithVehicle ||
        !uploadedUrls.idCardFront ||
        !uploadedUrls.idCardBack ||
        !uploadedUrls.vehicleFront ||
        !uploadedUrls.vehicleRear ||
        !uploadedUrls.vehicleLeft ||
        !uploadedUrls.vehicleRight
      ) {
        return Alert.alert("Validation", "Please upload all images.");
      }

      setLoading(true);

      const payload = {
        ...uploadedUrls,
        damageImages: damageImages
          .filter((img) => img.url)
          .map((img) => img.url),
      };

      await api.put(`/handover/save-images/${finalHandoverId}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      Alert.alert("Success", "Handover submitted successfully", [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/home"),
        },
      ]);
    } catch (error) {
      console.log("HANDOVER ERROR:", error?.message);

      Alert.alert(
        "Error",
        error?.response?.data?.message || error.message || "Upload failed",
      );
    } finally {
      setLoading(false);
    }
  };

  // Thumbnail sub-component that manages individual loading overlays
  const ImageBox = ({ image, icon, isUploading, onPress, label }) => (
    <TouchableOpacity
      style={[styles.imageBox, isUploading && styles.imageBoxUploading]}
      activeOpacity={0.8}
      onPress={onPress}
      disabled={isUploading}
    >
      <View style={styles.imageWrapper}>
        {image ? (
          <Image source={{ uri: image }} style={styles.previewImage} />
        ) : (
          <View style={styles.uploadPlaceholder}>
            <Ionicons name={icon} size={28} color="#2563EB" />
            <Text style={styles.imageBoxLabel}>{label}</Text>
          </View>
        )}

        {isUploading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#2563EB" size="small" />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#001B45" barStyle="light-content" />

      <LinearGradient colors={["#001B45", "#002B6B"]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.sideBtn}>
          <Ionicons name="chevron-back" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vehicle Handover Images</Text>
        <View style={{ width: 42 }} />
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.form}>
          {/* Identity Verification Card (Dual Layout) */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Identity Verification</Text>
            <View style={styles.yellowLine} />
          </View>

          <View style={styles.compositeCard}>
            <View style={styles.compositeCardHeader}>
              <View>
                <Text style={styles.cardTitle}>aadhar card</Text>
                <Text style={styles.cardSubtitle}>
                  Upload Front and Back Photo
                </Text>
              </View>
              <Ionicons name="card-outline" size={22} color="#64748B" />
            </View>
            <View style={styles.row}>
              <ImageBox
                label="Front Side"
                image={idFrontImage}
                icon="cloud-upload-outline"
                isUploading={uploading.idCardFront}
                onPress={() => pickImage(setIdFrontImage, "idCardFront")}
              />
              <ImageBox
                label="Back Side"
                image={idBackImage}
                icon="cloud-upload-outline"
                isUploading={uploading.idCardBack}
                onPress={() => pickImage(setIdBackImage, "idCardBack")}
              />
            </View>
          </View>

          {/* Driving License Card — Optional */}
          <View style={styles.compositeCard}>
            <View style={styles.compositeCardHeader}>
              <View>
                <Text style={styles.cardTitle}>
                  Driving License{" "}
                  <Text style={styles.optionalTag}>(Optional)</Text>
                </Text>
                <Text style={styles.cardSubtitle}>
                  Upload Front and Back Photo
                </Text>
              </View>
              <Ionicons
                name="document-text-outline"
                size={22}
                color="#64748B"
              />
            </View>
            <View style={styles.row}>
              <ImageBox
                label="Front Side"
                image={dlFrontImage}
                icon="cloud-upload-outline"
                isUploading={uploading.drivingLicenseFront}
                onPress={() =>
                  pickImage(setDlFrontImage, "drivingLicenseFront")
                }
              />
              <ImageBox
                label="Back Side"
                image={dlBackImage}
                icon="cloud-upload-outline"
                isUploading={uploading.drivingLicenseBack}
                onPress={() => pickImage(setDlBackImage, "drivingLicenseBack")}
              />
            </View>
          </View>

          {/* Toolkit & Spare Tyre Card — Optional */}
          <View style={styles.compositeCard}>
            <View style={styles.compositeCardHeader}>
              <View>
                <Text style={styles.cardTitle}>
                  Toolkit & Spare Tyre{" "}
                  <Text style={styles.optionalTag}>(Optional)</Text>
                </Text>
                <Text style={styles.cardSubtitle}>
                  Confirm toolkit and spare tyre are present
                </Text>
              </View>
              <Ionicons name="build-outline" size={22} color="#64748B" />
            </View>
            <View style={styles.row}>
              <ImageBox
                label="Toolkit"
                image={toolkitImage}
                icon="construct-outline"
                isUploading={uploading.toolkit}
                onPress={() => pickImage(setToolkitImage, "toolkit")}
              />
              <ImageBox
                label="Spare Tyre"
                image={spareTyreImage}
                icon="ellipse-outline"
                isUploading={uploading.spareTyre}
                onPress={() => pickImage(setSpareTyreImage, "spareTyre")}
              />
            </View>
          </View>

          {/* Odometer & Fuel Gauge Card — Optional */}
          <View style={styles.compositeCard}>
            <View style={styles.compositeCardHeader}>
              <View>
                <Text style={styles.cardTitle}>
                  4 photos of tyre{" "}
                  <Text style={styles.optionalTag}>(Optional)</Text>
                </Text>
              </View>
              <Ionicons name="speedometer-outline" size={22} color="#64748B" />
            </View>
            <View style={styles.row}>
              <ImageBox
                label="Odometer"
                image={odometerImage}
                icon="speedometer-outline"
                isUploading={uploading.odometer}
                onPress={() => pickImage(setOdometerImage, "odometer")}
              />
              <ImageBox
                label="Fuel Gauge"
                image={fuelGaugeImage}
                icon="water-outline"
                isUploading={uploading.fuelGauge}
                onPress={() => pickImage(setFuelGaugeImage, "fuelGauge")}
              />
            </View>
          </View>

          {/* Interior & Roof Top Card — Optional */}
          <View style={styles.compositeCard}>
            <View style={styles.row}>
              <ImageBox
                label="Interior"
                image={interiorImage}
                icon="scan-outline"
                isUploading={uploading.interior}
                onPress={() => pickImage(setInteriorImage, "interior")}
              />
              <ImageBox
                label="Roof Top"
                image={roofTopImage}
                icon="scan-outline"
                isUploading={uploading.roofTop}
                onPress={() => pickImage(setRoofTopImage, "roofTop")}
              />
            </View>
          </View>

          {/* Customer Verification Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Customer Verification</Text>
            <View style={styles.yellowLine} />
          </View>

          {/* Profile & Form Pics grouped together */}
          <View style={styles.compositeCard}>
            <View style={styles.compositeCardHeader}>
              <View>
                <Text style={styles.cardTitle}>Customer Identification</Text>
                <Text style={styles.cardSubtitle}>
                  Upload Form and Customer Photo
                </Text>
              </View>
              <Ionicons name="person-outline" size={22} color="#64748B" />
            </View>
            <View style={styles.row}>
              <ImageBox
                label="Form Photo"
                image={customerPhoto}
                icon="image-outline"
                isUploading={uploading.customerPhoto}
                onPress={() => pickImage(setCustomerPhoto, "customerPhoto")}
              />
              <ImageBox
                label="Clear Face"
                image={customerProfileImage}
                icon="person-circle-outline"
                isUploading={uploading.customerProfileImage}
                onPress={() =>
                  pickImage(setCustomerProfileImage, "customerProfileImage")
                }
              />
            </View>
          </View>

          {/* Handover Handshake View Card */}
          <View style={styles.compositeCard}>
            <View style={styles.compositeCardHeader}>
              <View style={styles.cardTextWrapSingle}>
                <Text style={styles.cardTitle}>Customer With Vehicle</Text>
                <Text style={styles.cardSubtitle}>
                  Customer standing alongside the vehicle
                </Text>
              </View>
              {uploading.customerWithVehicle ? (
                <ActivityIndicator color="#2563EB" size="small" />
              ) : (
                <Ionicons name="people-outline" size={22} color="#64748B" />
              )}
            </View>
            <ImageBox
              label="Capture Verification Photo"
              image={customerWithCar}
              icon="camera-outline"
              isUploading={uploading.customerWithVehicle}
              onPress={() =>
                pickImage(setCustomerWithCar, "customerWithVehicle")
              }
            />
          </View>

          {/* Vehicle Inspection Grid System */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Vehicle Inspection Photos</Text>
            <View style={styles.yellowLine} />
          </View>

          <View style={styles.compositeCard}>
            <View style={styles.compositeCardHeader}>
              <View>
                <Text style={styles.cardTitle}>Exterior Condition</Text>
                <Text style={styles.cardSubtitle}>
                  Capture Front & Right body profiles
                </Text>
              </View>
              <Ionicons name="car-sport-outline" size={22} color="#64748B" />
            </View>
            <View style={styles.row}>
              <ImageBox
                label="Front Angle"
                image={frontImage}
                icon="scan-outline"
                isUploading={uploading.vehicleFront}
                onPress={() => pickImage(setFrontImage, "vehicleFront")}
              />
              <ImageBox
                label="Right Side"
                image={rightImage}
                icon="scan-outline"
                isUploading={uploading.vehicleRight}
                onPress={() => pickImage(setRightImage, "vehicleRight")}
              />
            </View>
          </View>

          <View style={styles.compositeCard}>
            <View style={styles.compositeCardHeader}>
              <View>
                <Text style={styles.cardTitle}>Rear & Left Condition</Text>
                <Text style={styles.cardSubtitle}>
                  Capture Rear & Left body profiles
                </Text>
              </View>
              <Ionicons name="car-outline" size={22} color="#64748B" />
            </View>
            <View style={styles.row}>
              <ImageBox
                label="Rear Angle"
                image={rearImage}
                icon="scan-outline"
                isUploading={uploading.vehicleRear}
                onPress={() => pickImage(setRearImage, "vehicleRear")}
              />
              <ImageBox
                label="Left Side"
                image={leftImage}
                icon="scan-outline"
                isUploading={uploading.vehicleLeft}
                onPress={() => pickImage(setLeftImage, "vehicleLeft")}
              />
            </View>
          </View>

          {/* Damage Documentation */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Damage Photos (Optional)</Text>
            <View style={styles.yellowLine} />
          </View>

          <View style={styles.compositeCard}>
            <View style={styles.compositeCardHeader}>
              <View>
                <Text style={styles.cardTitle}>Existing Damage Close-ups</Text>
                <Text style={styles.cardSubtitle}>
                  Add a close-up photo for every scratch, dent, or damage
                </Text>
              </View>
              <Ionicons name="alert-circle-outline" size={22} color="#64748B" />
            </View>

            <View style={styles.damageGrid}>
              {damageImages.map((img) => (
                <View key={img.id} style={styles.damageThumbWrapper}>
                  <Image source={{ uri: img.uri }} style={styles.damageThumb} />
                  {img.uploading && (
                    <View style={styles.loadingOverlay}>
                      <ActivityIndicator color="#2563EB" size="small" />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.damageRemoveBtn}
                    onPress={() => removeDamageImage(img.id)}
                    disabled={img.uploading}
                  >
                    <Ionicons name="close" size={14} color="white" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={styles.damageAddBtn}
                onPress={addDamageImage}
              >
                <Ionicons name="camera-outline" size={24} color="#2563EB" />
                <Text style={styles.damageAddText}>Add Photo</Text>
              </TouchableOpacity>
            </View>

            {damageImages.length === 0 && (
              <Text style={styles.damageHint}>
                No damage? You can leave this empty and submit.
              </Text>
            )}
          </View>

          {/* Bottom Control Actions */}
          <View style={styles.bottomButtons}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => router.back()}
              disabled={loading}
            >
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                (loading || Object.values(uploading).some(Boolean)) && {
                  opacity: 0.6,
                },
              ]}
              onPress={handleSubmit}
              disabled={loading || Object.values(uploading).some(Boolean)}
            >
              {loading ? (
                <ActivityIndicator color="#111827" />
              ) : Object.values(uploading).some(Boolean) ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <ActivityIndicator color="#111827" size="small" />
                  <Text style={[styles.saveText, { marginLeft: 8 }]}>
                    Uploading Assets...
                  </Text>
                </View>
              ) : (
                <Text style={styles.saveText}>Submit Handover</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sideBtn: { width: 42 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "white",
    fontSize: 20,
    fontWeight: "800",
    marginRight: 20,
  },
  scrollContent: { paddingBottom: 40 },
  form: { paddingHorizontal: 14, paddingTop: 8 },
  sectionHeader: { marginTop: 18, marginBottom: 12 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  yellowLine: {
    width: 30,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#FFC107",
    marginTop: 6,
  },
  compositeCard: {
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 14,
  },
  compositeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  imageBox: {
    flex: 1,
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    backgroundColor: "#EFF6FF",
  },
  imageBoxUploading: {
    borderColor: "#BFDBFE",
  },
  imageWrapper: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  uploadPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 4,
  },
  imageBoxLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  cardTextWrapSingle: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  optionalTag: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  bottomButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: "#002B6B",
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  cancelText: {
    color: "#002B6B",
    fontSize: 15,
    fontWeight: "700",
  },
  saveBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#FFC107",
    justifyContent: "center",
    alignItems: "center",
  },
  saveText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800",
  },

  // Damage photos
  damageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  damageThumbWrapper: {
    width: 84,
    height: 84,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  damageThumb: { width: "100%", height: "100%", resizeMode: "cover" },
  damageRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  damageAddBtn: {
    width: 84,
    height: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  damageAddText: {
    fontSize: 10,
    color: "#2563EB",
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center",
  },
  damageHint: { fontSize: 12, color: "#94A3B8", marginTop: 10 },
});
