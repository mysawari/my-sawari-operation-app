import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

// Must match the maxlength on the backend model / controller.
const DISPLAY_NAME_MAX_LENGTH = 100;
const MAX_IMAGES = 5;

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

// FREE CROP: allowsEditing opens the crop screen, and leaving out `aspect`
// lets the user drag the crop box to any size/shape they want.
// (Android: fully free crop. iOS: the system cropper is always square.)
const IMAGE_PICKER_OPTIONS = {
  mediaTypes: ["images"],
  allowsEditing: true,
  quality: 0.8,
};

// Vehicle Type only applies to the "car" category.
const CAR_VEHICLE_TYPES = [
  "SUV",
  "Sedan",
  "Hatchback",
  "Luxury",
  "Tempo Traveller",
  "Mini Bus",
  "Bus",
];

// ── REUSABLE SUB-COMPONENTS ──
const InputField = ({
  label,
  placeholder,
  icon,
  required = false,
  multiline = false,
  fullWidth = false,
  value,
  onChangeText,
  maxLength,
  keyboardType = "default",
  autoCapitalize = "sentences",
}) => (
  <View style={[styles.inputContainer, fullWidth && { width: "100%" }]}>
    <Text style={styles.label}>
      {label}
      {required && <Text style={styles.required}> *</Text>}
    </Text>

    <View style={[styles.inputBox, multiline && styles.notesBox]}>
      <Ionicons
        name={icon}
        size={18}
        color="#64748B"
        style={{ marginTop: multiline ? 4 : 0 }}
      />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        style={[styles.input, multiline && styles.notesInput]}
        multiline={multiline}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength ?? (multiline ? 200 : undefined)}
      />
    </View>
  </View>
);

const PickerField = ({
  label,
  selectedValue,
  onValueChange,
  options,
  required = false,
}) => (
  <View style={styles.inputContainer}>
    <Text style={styles.label}>
      {label}
      {required && <Text style={styles.required}> *</Text>}
    </Text>

    <View style={styles.pickerBox}>
      <Picker
        selectedValue={selectedValue}
        onValueChange={onValueChange}
        style={Platform.OS === "ios" ? undefined : { color: "#111827" }}
        dropdownIconColor="#64748B"
      >
        {options.map((item) => (
          <Picker.Item
            key={item.value || "empty"}
            label={item.label}
            value={item.value}
          />
        ))}
      </Picker>
    </View>
  </View>
);

const DateField = ({
  label,
  placeholder,
  icon,
  required = false,
  value,
  onPress,
}) => (
  <View style={styles.inputContainer}>
    <Text style={styles.label}>
      {label}
      {required && <Text style={styles.required}> *</Text>}
    </Text>

    <TouchableOpacity style={styles.inputBox} onPress={onPress}>
      <Ionicons name={icon} size={18} color="#64748B" />
      <Text style={[styles.placeholder, value ? { color: "#111827" } : null]}>
        {value || placeholder}
      </Text>
    </TouchableOpacity>
  </View>
);

const CheckboxField = ({ label, value, onToggle }) => (
  <View style={styles.inputContainer}>
    <Text style={styles.label}>{label}</Text>
    <TouchableOpacity
      style={[styles.inputBox, { justifyContent: "space-between" }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <Text style={{ color: value === "Yes" ? "#111827" : (value === "No" ? "#111827" : "#94A3B8"), fontSize: 14 }}>
        {value === "Yes" ? "Available" : (value === "No" ? "Not Available" : "Not Set (Empty)")}
      </Text>
      <Ionicons
        name={value === "Yes" ? "checkbox" : "square-outline"}
        size={22}
        color={value === "Yes" ? "#2563EB" : "#94A3B8"}
      />
    </TouchableOpacity>
  </View>
);

const SectionTitle = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.yellowLine} />
  </View>
);

// ── MAIN SCREEN ──
export default function EditVehicleScreen() {
  const router = useRouter();
  const { vehicleId } = useLocalSearchParams();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  const [loading, setLoading] = useState(false);

  // Vehicle fields
  const [vehicleName, setVehicleName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [category, setCategory] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [transmission, setTransmission] = useState("");
  const [seatingCapacity, setSeatingCapacity] = useState("");
  const [color, setColor] = useState("");
  const [chassisNumber, setChassisNumber] = useState("");
  const [engineNumber, setEngineNumber] = useState("");
  const [engineCapacity, setEngineCapacity] = useState("");
  const [mileage, setMileage] = useState("");
  const [ac, setAc] = useState("");

  // Features
  const [carPlay, setCarPlay] = useState("");
  const [bluetooth, setBluetooth] = useState("");
  const [touchscreen, setTouchscreen] = useState("");
  const [usbCharging, setUsbCharging] = useState("");
  const [sunroof, setSunroof] = useState("");

  // Safety
  const [airbags, setAirbags] = useState("");
  const [absEbd, setAbsEbd] = useState("");
  const [rearParkingSensors, setRearParkingSensors] = useState("");
  const [rearCamera, setRearCamera] = useState("");
  const [gps, setGps] = useState("");

  // Bike Features & Safety
  const [digitalDisplay, setDigitalDisplay] = useState("");
  const [bikeAbs, setBikeAbs] = useState("");
  const [discBrakes, setDiscBrakes] = useState("");
  const [cbs, setCbs] = useState("");

  const [notes, setNotes] = useState("");
  const [vehicleStatus, setVehicleStatus] = useState("available");
  const [pricePerDay, setPricePerDay] = useState("");

  const isCarCategory = category === "car";

  // Dates
  const [regDate, setRegDate] = useState(null);
  const [insuranceDate, setInsuranceDate] = useState(null);
  const [pucDate, setPucDate] = useState(null);
  const [fitnessDate, setFitnessDate] = useState(null);

  const [showPicker, setShowPicker] = useState(false);
  const [selectedDateField, setSelectedDateField] = useState("");

  // Images: each slot is null or { uri, name, type, isExisting }
  const [images, setImages] = useState(Array(MAX_IMAGES).fill(null));

  // Image source sheet (camera / gallery) - holds the slot index, or null.
  const [imageSheetIndex, setImageSheetIndex] = useState(null);

  // Full-screen preview - holds the slot index, or null.
  const [previewIndex, setPreviewIndex] = useState(null);

  useEffect(() => {
    if (vehicleId && token) {
      fetchVehicleDetails();
    }
  }, [vehicleId, token]);

  const fetchVehicleDetails = async () => {
    try {
      setLoading(true);

      const res = await api.get(`/vehicles/${vehicleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const vehicle = res?.data?.data;
      if (!vehicle) throw new Error("Vehicle not found");

      setVehicleName(vehicle.vehicleName || "");
      setDisplayName(vehicle.displayName || "");
      setVehicleNumber(vehicle.vehicleNumber || "");
      setManufacturer(vehicle.manufacturer || "");
      setModel(vehicle.model || "");
      setVariant(vehicle.variant || "");
      setPricePerDay(
        vehicle.pricePerDay != null ? String(vehicle.pricePerDay) : "",
      );
      setCategory(vehicle.category || "");
      setVehicleType(
        vehicle.category === "car" ? vehicle.vehicleType || "" : "",
      );
      setFuelType(vehicle.fuelType || "");
      setTransmission(vehicle.transmission || "");
      setSeatingCapacity(
        vehicle.seatingCapacity != null ? String(vehicle.seatingCapacity) : "",
      );
      setColor(vehicle.color || "");
      setChassisNumber(vehicle.chassisNumber || "");
      setEngineNumber(vehicle.engineNumber || "");
      setEngineCapacity(vehicle.engineCapacity || "");
      setMileage(vehicle.mileage || "");
      setAc(vehicle.ac || "");

      setCarPlay(vehicle.carPlay || "");
      setBluetooth(vehicle.bluetooth || "");
      setTouchscreen(vehicle.touchscreen || "");
      setUsbCharging(vehicle.usbCharging || "");
      setSunroof(vehicle.sunroof || "");

      setAirbags(vehicle.airbags || "");
      setAbsEbd(vehicle.absEbd || "");
      setRearParkingSensors(vehicle.rearParkingSensors || "");
      setRearCamera(vehicle.rearCamera || "");
      setGps(vehicle.gps || "");

      setDigitalDisplay(vehicle.digitalDisplay || "");
      setBikeAbs(vehicle.bikeAbs || "");
      setDiscBrakes(vehicle.discBrakes || "");
      setCbs(vehicle.cbs || "");

      setNotes(vehicle.notes || "");
      setVehicleStatus(vehicle.status || "available");

      setRegDate(
        vehicle.registrationDate ? new Date(vehicle.registrationDate) : null,
      );
      setInsuranceDate(
        vehicle.insuranceValidUpto
          ? new Date(vehicle.insuranceValidUpto)
          : null,
      );
      setPucDate(vehicle.pucValidUpto ? new Date(vehicle.pucValidUpto) : null);
      setFitnessDate(
        vehicle.fitnessValidUpto ? new Date(vehicle.fitnessValidUpto) : null,
      );

      if (Array.isArray(vehicle.images) && vehicle.images.length > 0) {
        const incoming = vehicle.images
          .map((img) => (typeof img === "string" ? img : img?.url))
          .filter(Boolean)
          .map((url) => ({ uri: url, isExisting: true }));

        setImages(
          [...incoming, ...Array(MAX_IMAGES).fill(null)].slice(0, MAX_IMAGES),
        );
      }
    } catch (error) {
      console.log(
        "FETCH ERROR DETAILS:",
        error?.response?.data?.message || error?.message,
      );
      Alert.alert("Error", "Failed to fetch vehicle details.");
    } finally {
      setLoading(false);
    }
  };

  // ── DATES ──
  const formatDate = (date) => (date ? date.toLocaleDateString("en-IN") : "");

  const openDatePicker = (field) => {
    setSelectedDateField(field);
    setShowPicker(true);
  };

  const onDateChange = (event, selectedDate) => {
    setShowPicker(false);
    if (!selectedDate) return;

    switch (selectedDateField) {
      case "reg":
        setRegDate(selectedDate);
        break;
      case "insurance":
        setInsuranceDate(selectedDate);
        break;
      case "puc":
        setPucDate(selectedDate);
        break;
      case "fitness":
        setFitnessDate(selectedDate);
        break;
      default:
        break;
    }
  };

  const getPickerDate = () => {
    switch (selectedDateField) {
      case "reg":
        return regDate || new Date();
      case "insurance":
        return insuranceDate || new Date();
      case "puc":
        return pucDate || new Date();
      case "fitness":
        return fitnessDate || new Date();
      default:
        return new Date();
    }
  };

  // ── IMAGES ──
  const setImageAt = (index, value) => {
    setImages((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const assetToImage = (asset, index) => ({
    uri: asset.uri,
    name: asset.fileName || `vehicle-${Date.now()}-${index}.jpg`,
    type: asset.mimeType || "image/jpeg",
    isExisting: false,
  });

  // Empty slot -> choose source. Filled slot -> open full preview.
  const handleImageSlotPress = (index) => {
    if (images[index]) {
      setPreviewIndex(index);
    } else {
      setImageSheetIndex(index);
    }
  };

  // Close the sheet first, then launch the camera / gallery.
  // iOS can't present the picker while a Modal is still animating out.
  const runAfterSheetCloses = (action) => {
    const index = imageSheetIndex;
    setImageSheetIndex(null);
    if (index === null) return;
    setTimeout(() => action(index), Platform.OS === "ios" ? 450 : 150);
  };

  const takePhoto = async (index) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Camera Permission Needed",
          "Allow camera access in your device settings to take vehicle photos.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync(IMAGE_PICKER_OPTIONS);
      if (!result.canceled && result.assets?.length) {
        setImageAt(index, assetToImage(result.assets[0], index));
      }
    } catch (error) {
      console.log("CAMERA ERROR:", error?.message);
      Alert.alert("Error", "Could not open the camera.");
    }
  };

  const pickFromGallery = async (index) => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Needed",
          "Allow photo access in your device settings to choose vehicle photos.",
        );
        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS);
      if (!result.canceled && result.assets?.length) {
        setImageAt(index, assetToImage(result.assets[0], index));
      }
    } catch (error) {
      console.log("GALLERY ERROR:", error?.message);
      Alert.alert("Error", "Could not open the gallery.");
    }
  };

  // Indexes of slots that currently hold an image (for preview navigation).
  const filledImageIndexes = images
    .map((img, i) => (img ? i : null))
    .filter((i) => i !== null);

  const previewPosition =
    previewIndex !== null ? filledImageIndexes.indexOf(previewIndex) : -1;

  const showPrevImage = () => {
    if (previewPosition > 0) {
      setPreviewIndex(filledImageIndexes[previewPosition - 1]);
    }
  };

  const showNextImage = () => {
    if (previewPosition < filledImageIndexes.length - 1) {
      setPreviewIndex(filledImageIndexes[previewPosition + 1]);
    }
  };

  const replacePreviewImage = () => {
    const index = previewIndex;
    setPreviewIndex(null);
    setTimeout(() => setImageSheetIndex(index), 300);
  };

  const removePreviewImage = () => {
    const index = previewIndex;
    Alert.alert("Remove Photo", "Remove this photo from the vehicle?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setImageAt(index, null);
          setPreviewIndex(null);
        },
      },
    ]);
  };

  // ── CATEGORY ──
  const handleCategoryChange = (value) => {
    setCategory(value);
    if (value !== "car") setVehicleType("");
  };

  // ── UPDATE ──
  const handleUpdateVehicle = async () => {
    if (
      !vehicleName.trim() ||
      !vehicleNumber.trim() ||
      !manufacturer ||
      !fuelType ||
      !transmission ||
      !seatingCapacity.trim()
    ) {
      Alert.alert("Validation Error", "Please fill all required fields.");
      return;
    }

    if (isNaN(Number(seatingCapacity)) || Number(seatingCapacity) <= 0) {
      Alert.alert(
        "Validation Error",
        "Seating capacity must be a valid number.",
      );
      return;
    }

    if (pricePerDay && isNaN(Number(pricePerDay))) {
      Alert.alert("Validation Error", "Price per day must be a valid number.");
      return;
    }

    if (displayName.trim().length > DISPLAY_NAME_MAX_LENGTH) {
      Alert.alert(
        "Validation Error",
        `Display name cannot exceed ${DISPLAY_NAME_MAX_LENGTH} characters.`,
      );
      return;
    }

    if (isCarCategory && !vehicleType) {
      Alert.alert(
        "Validation Error",
        "Please select a Vehicle Type for this car.",
      );
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("vehicleName", vehicleName.trim());
      // Always sent (even empty) so employees can clear a display name.
      formData.append("displayName", displayName.trim());
      formData.append(
        "vehicleNumber",
        vehicleNumber.trim().toUpperCase().replace(/\s+/g, ""),
      );
      formData.append("manufacturer", manufacturer);
      formData.append("model", model.trim());
      formData.append("variant", variant.trim());
      formData.append(
        "pricePerDay",
        pricePerDay ? String(Number(pricePerDay)) : "0",
      );

      if (category) formData.append("category", category);
      if (vehicleType) formData.append("vehicleType", vehicleType);

      formData.append("fuelType", fuelType);
      formData.append("transmission", transmission);
      formData.append("seatingCapacity", String(Number(seatingCapacity)));
      formData.append("color", color);
      formData.append("chassisNumber", chassisNumber.trim());
      formData.append("engineNumber", engineNumber.trim());
      formData.append("engineCapacity", engineCapacity.trim());
      formData.append("mileage", mileage.trim());
      formData.append("ac", ac.trim());

      formData.append("carPlay", carPlay.trim());
      formData.append("bluetooth", bluetooth.trim());
      formData.append("touchscreen", touchscreen.trim());
      formData.append("usbCharging", usbCharging.trim());
      formData.append("sunroof", sunroof.trim());

      formData.append("airbags", airbags.trim());
      formData.append("absEbd", absEbd.trim());
      formData.append("rearParkingSensors", rearParkingSensors.trim());
      formData.append("rearCamera", rearCamera.trim());
      formData.append("gps", gps.trim());

      formData.append("digitalDisplay", digitalDisplay.trim());
      formData.append("bikeAbs", bikeAbs.trim());
      formData.append("discBrakes", discBrakes.trim());
      formData.append("cbs", cbs.trim());

      formData.append("notes", notes.trim());
      formData.append("status", vehicleStatus);

      if (regDate) formData.append("registrationDate", regDate.toISOString());
      if (insuranceDate)
        formData.append("insuranceValidUpto", insuranceDate.toISOString());
      if (pucDate) formData.append("pucValidUpto", pucDate.toISOString());
      if (fitnessDate)
        formData.append("fitnessValidUpto", fitnessDate.toISOString());

      images.filter(Boolean).forEach((img) => {
        if (img.isExisting) {
          formData.append("existingImages", img.uri);
        } else {
          formData.append("images", {
            uri: img.uri,
            name: img.name,
            type: img.type,
          });
        }
      });

      await api.put(`/vehicles/update/${vehicleId}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      Alert.alert("Success", "Vehicle updated successfully.");
      router.back();
    } catch (error) {
      console.log(
        "UPDATE ERROR:",
        error?.response?.data?.message || error?.message,
      );
      Alert.alert(
        "Update Failed",
        error?.response?.data?.message || "Failed to update vehicle.",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── UI ──
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A1628" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <LinearGradient colors={["#0A1628", "#0F2554"]} style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={22} color="white" />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Edit Vehicle</Text>
              <Text style={styles.headerSub}>
                Modify fleet vehicle parameters
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.saveTopBtn, loading && { opacity: 0.6 }]}
              onPress={handleUpdateVehicle}
              disabled={loading}
            >
              <Ionicons name="save-outline" size={18} color="#0A1628" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <View style={styles.formCard}>
            <SectionTitle title="Vehicle Information" />

            <View style={styles.row}>
              <InputField
                label="Vehicle Name"
                placeholder="Enter vehicle name"
                icon="car-outline"
                required
                value={vehicleName}
                onChangeText={setVehicleName}
              />
              <InputField
                label="Vehicle Number"
                placeholder="Enter vehicle number"
                icon="reader-outline"
                required
                autoCapitalize="characters"
                value={vehicleNumber}
                onChangeText={setVehicleNumber}
              />
            </View>

            <InputField
              label="Vehicle Display Name (Optional)"
              placeholder="Innova"
              icon="text-outline"
              fullWidth
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
            />

            <View style={styles.row}>
              <PickerField
                label="Manufacturer"
                required
                selectedValue={manufacturer}
                onValueChange={setManufacturer}
                options={[
                  { label: "Select Manufacturer", value: "" },
                  { label: "Toyota", value: "Toyota" },
                  { label: "Mahindra", value: "Mahindra" },
                  { label: "Maruti Suzuki", value: "Maruti Suzuki" },
                  { label: "Hyundai", value: "Hyundai" },
                  { label: "Tata", value: "Tata" },
                  { label: "Kia", value: "Kia" },
                  { label: "Honda", value: "Honda" },
                  { label: "MG", value: "MG" },
                  { label: "Renault", value: "Renault" },
                  { label: "Nissan", value: "Nissan" },
                  { label: "Skoda", value: "Skoda" },
                  { label: "Volkswagen", value: "Volkswagen" },
                  { label: "Jeep", value: "Jeep" },
                  { label: "Force Motors", value: "Force Motors" },
                  { label: "Isuzu", value: "Isuzu" },
                  { label: "Citroen", value: "Citroen" },
                  { label: "BYD", value: "BYD" },
                  { label: "BMW", value: "BMW" },
                  { label: "Mercedes-Benz", value: "Mercedes-Benz" },
                ]}
              />
              <InputField
                label="Model"
                placeholder="Enter model"
                icon="cube-outline"
                value={model}
                onChangeText={setModel}
              />
            </View>

            <View style={styles.row}>
              <InputField
                label="Variant"
                placeholder="Enter variant"
                icon="pricetag-outline"
                value={variant}
                onChangeText={setVariant}
              />
              <InputField
                label="Price Per Day"
                placeholder="Enter price per day"
                icon="cash-outline"
                keyboardType="decimal-pad"
                value={pricePerDay}
                onChangeText={(t) => setPricePerDay(t.replace(/[^0-9.]/g, ""))}
              />
            </View>

            {/* CATEGORY + VEHICLE TYPE */}
            <View style={styles.row}>
              <PickerField
                label="Category"
                selectedValue={category}
                onValueChange={handleCategoryChange}
                options={[
                  { label: "Select category", value: "" },
                  { label: "Bike", value: "bike" },
                  { label: "Car", value: "car" },
                ]}
              />

              {isCarCategory ? (
                <PickerField
                  label="Vehicle Type"
                  required
                  selectedValue={vehicleType}
                  onValueChange={setVehicleType}
                  options={[
                    { label: "Select vehicle type", value: "" },
                    ...CAR_VEHICLE_TYPES.map((type) => ({
                      label: type,
                      value: type,
                    })),
                  ]}
                />
              ) : category === "bike" ? (
                <PickerField
                  label="Vehicle Type (Optional)"
                  selectedValue={vehicleType}
                  onValueChange={setVehicleType}
                  options={[
                    { label: "Select vehicle type", value: "" },
                    { label: "Commuter", value: "Commuter" },
                    { label: "Sports", value: "Sports" },
                    { label: "Cruiser", value: "Cruiser" },
                    { label: "Scooter", value: "Scooter" },
                  ]}
                />
              ) : (
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Vehicle Type</Text>
                  <View style={styles.noticeBox}>
                    <Ionicons
                      name="information-circle-outline"
                      size={16}
                      color="#64748B"
                    />
                    <Text style={styles.noticeText}>
                      Select category first
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.row}>
              <PickerField
                label="Fuel Type"
                required
                selectedValue={fuelType}
                onValueChange={setFuelType}
                options={[
                  { label: "Select fuel type", value: "" },
                  { label: "Petrol", value: "Petrol" },
                  { label: "Diesel", value: "Diesel" },
                  { label: "Electric", value: "Electric" },
                  { label: "CNG", value: "CNG" },
                  { label: "Hybrid", value: "Hybrid" },
                ]}
              />
              <PickerField
                label="Transmission"
                required
                selectedValue={transmission}
                onValueChange={setTransmission}
                options={[
                  { label: "Select transmission", value: "" },
                  { label: "Manual", value: "Manual" },
                  { label: "Automatic", value: "Automatic" },
                ]}
              />
            </View>

            <View style={styles.row}>
              <InputField
                label="Seating Capacity"
                placeholder="Enter seating capacity"
                icon="people-outline"
                required
                keyboardType="number-pad"
                value={seatingCapacity}
                onChangeText={(t) =>
                  setSeatingCapacity(t.replace(/[^0-9]/g, ""))
                }
              />
              <PickerField
                label="Color"
                selectedValue={color}
                onValueChange={setColor}
                options={[
                  { label: "Select color", value: "" },
                  { label: "White", value: "White" },
                  { label: "Black", value: "Black" },
                  { label: "Silver", value: "Silver" },
                  { label: "Blue", value: "Blue" },
                  { label: "Red", value: "Red" },
                  { label: "Grey", value: "Grey" },
                  { label: "Brown", value: "Brown" },
                ]}
              />
            </View>

            <InputField
              label="Chassis Number (Optional)"
              placeholder="Enter chassis number"
              icon="card-outline"
              fullWidth
              autoCapitalize="characters"
              value={chassisNumber}
              onChangeText={setChassisNumber}
            />

            <InputField
              label="Engine Number (Optional)"
              placeholder="Enter engine number"
              icon="build-outline"
              fullWidth
              autoCapitalize="characters"
              value={engineNumber}
              onChangeText={setEngineNumber}
            />

            {isCarCategory && (
              <>
                <SectionTitle title="Car Specifications" />
                <View style={styles.row}>
                  <InputField
                    label="Engine Capacity"
                    placeholder="e.g. 1.5L"
                    icon="speedometer-outline"
                    value={engineCapacity}
                    onChangeText={setEngineCapacity}
                  />

                  <InputField
                    label="Mileage"
                    placeholder="e.g. 18 km/l"
                    icon="speedometer-outline"
                    value={mileage}
                    onChangeText={setMileage}
                  />
                </View>

                <View style={styles.row}>
                  <CheckboxField
                    label="AC Available"
                    value={ac}
                    onToggle={() => setAc(ac === "Yes" ? "No" : (ac === "No" ? "" : "Yes"))}
                  />
                  <CheckboxField
                    label="Apple CarPlay / Android Auto"
                    value={carPlay}
                    onToggle={() => setCarPlay(carPlay === "Yes" ? "No" : (carPlay === "No" ? "" : "Yes"))}
                  />
                </View>

                <View style={styles.row}>
                  <CheckboxField
                    label="Bluetooth"
                    value={bluetooth}
                    onToggle={() => setBluetooth(bluetooth === "Yes" ? "No" : (bluetooth === "No" ? "" : "Yes"))}
                  />
                  <CheckboxField
                    label="Touchscreen"
                    value={touchscreen}
                    onToggle={() => setTouchscreen(touchscreen === "Yes" ? "No" : (touchscreen === "No" ? "" : "Yes"))}
                  />
                </View>

                <View style={styles.row}>
                  <CheckboxField
                    label="USB Charging"
                    value={usbCharging}
                    onToggle={() => setUsbCharging(usbCharging === "Yes" ? "No" : (usbCharging === "No" ? "" : "Yes"))}
                  />
                  <CheckboxField
                    label="Sunroof"
                    value={sunroof}
                    onToggle={() => setSunroof(sunroof === "Yes" ? "No" : (sunroof === "No" ? "" : "Yes"))}
                  />
                </View>

                <SectionTitle title="Car Safety" />
                <View style={styles.row}>
                  <CheckboxField
                    label="Airbags"
                    value={airbags}
                    onToggle={() => setAirbags(airbags === "Yes" ? "No" : (airbags === "No" ? "" : "Yes"))}
                  />
                  <CheckboxField
                    label="ABS + EBD"
                    value={absEbd}
                    onToggle={() => setAbsEbd(absEbd === "Yes" ? "No" : (absEbd === "No" ? "" : "Yes"))}
                  />
                </View>

                <View style={styles.row}>
                  <CheckboxField
                    label="Rear Parking Sensors"
                    value={rearParkingSensors}
                    onToggle={() => setRearParkingSensors(rearParkingSensors === "Yes" ? "No" : (rearParkingSensors === "No" ? "" : "Yes"))}
                  />
                  <CheckboxField
                    label="Rear Camera"
                    value={rearCamera}
                    onToggle={() => setRearCamera(rearCamera === "Yes" ? "No" : (rearCamera === "No" ? "" : "Yes"))}
                  />
                </View>

                <View style={styles.row}>
                  <CheckboxField
                    label="GPS Navigation"
                    value={gps}
                    onToggle={() => setGps(gps === "Yes" ? "No" : (gps === "No" ? "" : "Yes"))}
                  />
                  <View style={styles.inputContainer} />
                </View>
              </>
            )}

            {!isCarCategory && category === "bike" && (
              <>
                <SectionTitle title="Bike Specifications" />
                <View style={styles.row}>
                  <InputField
                    label="Engine (cc)"
                    placeholder="e.g. 125cc"
                    icon="speedometer-outline"
                    value={engineCapacity}
                    onChangeText={setEngineCapacity}
                  />

                  <InputField
                    label="Mileage / Range"
                    placeholder="e.g. 45 km/l"
                    icon="speedometer-outline"
                    value={mileage}
                    onChangeText={setMileage}
                  />
                </View>

                <SectionTitle title="Bike Features" />
                <View style={styles.row}>
                  <CheckboxField
                    label="Bluetooth"
                    value={bluetooth}
                    onToggle={() => setBluetooth(bluetooth === "Yes" ? "No" : (bluetooth === "No" ? "" : "Yes"))}
                  />
                  <CheckboxField
                    label="USB Charging"
                    value={usbCharging}
                    onToggle={() => setUsbCharging(usbCharging === "Yes" ? "No" : (usbCharging === "No" ? "" : "Yes"))}
                  />
                </View>

                <View style={styles.row}>
                  <CheckboxField
                    label="Digital Display"
                    value={digitalDisplay}
                    onToggle={() => setDigitalDisplay(digitalDisplay === "Yes" ? "No" : (digitalDisplay === "No" ? "" : "Yes"))}
                  />
                  <View style={styles.inputContainer} />
                </View>

                <SectionTitle title="Bike Safety" />
                <View style={styles.row}>
                  <CheckboxField
                    label="ABS"
                    value={bikeAbs}
                    onToggle={() => setBikeAbs(bikeAbs === "Yes" ? "No" : (bikeAbs === "No" ? "" : "Yes"))}
                  />
                  <CheckboxField
                    label="Disc Brakes"
                    value={discBrakes}
                    onToggle={() => setDiscBrakes(discBrakes === "Yes" ? "No" : (discBrakes === "No" ? "" : "Yes"))}
                  />
                </View>

                <View style={styles.row}>
                  <CheckboxField
                    label="CBS (Combined Braking)"
                    value={cbs}
                    onToggle={() => setCbs(cbs === "Yes" ? "No" : (cbs === "No" ? "" : "Yes"))}
                  />
                  <View style={styles.inputContainer} />
                </View>
              </>
            )}

            <SectionTitle title="Vehicle Images" />

            <Text style={styles.imageHint}>
              Tap an empty slot to take or choose a photo, then crop it any way
              you like. Tap a photo to view, replace, or remove it.
            </Text>

            <View style={styles.imageRow}>
              {images.map((img, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.imageSlot, img && styles.imageSlotFilled]}
                  onPress={() => handleImageSlotPress(index)}
                  activeOpacity={0.8}
                >
                  {img ? (
                    <>
                      <Image
                        source={{ uri: img.uri }}
                        style={styles.preview}
                        resizeMode="cover"
                      />
                      <View style={styles.expandBadge}>
                        <Ionicons
                          name="expand-outline"
                          size={10}
                          color="white"
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      <Ionicons
                        name="camera-outline"
                        size={22}
                        color="#94A3B8"
                      />
                      <Text style={styles.addPhoto}>Add Photo</Text>
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <SectionTitle title="Additional Information" />

            <View style={styles.row}>
              <DateField
                label="Registration Date"
                placeholder="Select date"
                icon="calendar-outline"
                value={formatDate(regDate)}
                onPress={() => openDatePicker("reg")}
              />
              <DateField
                label="Insurance Valid Upto"
                placeholder="Select date"
                icon="shield-checkmark-outline"
                value={formatDate(insuranceDate)}
                onPress={() => openDatePicker("insurance")}
              />
            </View>

            <View style={styles.row}>
              <DateField
                label="PUC Valid Upto"
                placeholder="Select date"
                icon="leaf-outline"
                value={formatDate(pucDate)}
                onPress={() => openDatePicker("puc")}
              />
              <DateField
                label="Fitness Valid Upto"
                placeholder="Select date"
                icon="document-text-outline"
                value={formatDate(fitnessDate)}
                onPress={() => openDatePicker("fitness")}
              />
            </View>

            <InputField
              label="Notes (Optional)"
              placeholder="Enter any notes about this vehicle"
              icon="document-text-outline"
              multiline
              fullWidth
              value={notes}
              onChangeText={setNotes}
            />
            <Text style={styles.counter}>{notes.length}/200</Text>

            <SectionTitle title="Status" />

            <Text style={styles.label}>
              Vehicle Status<Text style={styles.required}> *</Text>
            </Text>

            {user?.role === "SUPER_ADMIN" ? (
              <View style={styles.statusRow}>
                {[
                  {
                    value: "available",
                    title: "Available",
                    sub: "Ready for rent",
                    active: styles.activeAvailable,
                    color: "#22C55E",
                  },
                  {
                    value: "rent",
                    title: "On Rent",
                    sub: "Currently rented",
                    active: styles.activeRent,
                    color: "#F59E0B",
                  },
                  {
                    value: "service",
                    title: "Under Service",
                    sub: "Not available",
                    active: styles.activeService,
                    color: "#EF4444",
                  },
                ].map((item) => {
                  const isActive = vehicleStatus === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      style={[styles.statusCard, isActive && item.active]}
                      onPress={() => setVehicleStatus(item.value)}
                    >
                      <View style={[styles.radio, { borderColor: item.color }]}>
                        {isActive && (
                          <View
                            style={[
                              styles.radioDot,
                              { backgroundColor: item.color },
                            ]}
                          />
                        )}
                      </View>
                      <View>
                        <Text style={styles.statusTitle}>{item.title}</Text>
                        <Text style={styles.statusSub}>{item.sub}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.lockedBox}>
                <Text style={styles.lockedText}>
                  Only Super Admin can change vehicle status. Please contact
                  your administrator.
                </Text>
              </View>
            )}

            <View style={styles.bottomButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => router.back()}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, loading && { opacity: 0.7 }]}
                onPress={handleUpdateVehicle}
                disabled={loading}
              >
                <Text style={styles.saveText}>
                  {loading ? "Updating..." : "Update Vehicle"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {showPicker && (
          <DateTimePicker
            value={getPickerDate()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onValueChange={onDateChange}
            onDismiss={() => setShowPicker(false)}
          />
        )}
      </KeyboardAvoidingView>

      {/* IMAGE SOURCE SHEET (Camera / Gallery) */}
      <Modal
        visible={imageSheetIndex !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setImageSheetIndex(null)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setImageSheetIndex(null)}
        >
          <Pressable style={styles.sheet} onPress={() => { }}>
            <View style={styles.sheetHandle} />

            <Text style={styles.sheetTitle}>
              Add photo {imageSheetIndex !== null ? imageSheetIndex + 1 : ""}
            </Text>
            <Text style={styles.sheetSub}>
              Take a new photo or pick one from your gallery
            </Text>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => runAfterSheetCloses(takePhoto)}
            >
              <View style={[styles.sheetIcon, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="camera" size={22} color="#B45309" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetOptionTitle}>Take photo</Text>
                <Text style={styles.sheetOptionSub}>Use the camera</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetOption}
              onPress={() => runAfterSheetCloses(pickFromGallery)}
            >
              <View style={[styles.sheetIcon, { backgroundColor: "#E0E7FF" }]}>
                <Ionicons name="images" size={22} color="#1E3A8A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetOptionTitle}>Choose from gallery</Text>
                <Text style={styles.sheetOptionSub}>
                  Pick an existing photo
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => setImageSheetIndex(null)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* FULL-SCREEN IMAGE PREVIEW */}
      <Modal
        visible={previewIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewIndex(null)}
      >
        <View style={styles.previewContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />

          <View style={styles.previewHeader}>
            <TouchableOpacity
              style={styles.previewCloseBtn}
              onPress={() => setPreviewIndex(null)}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>

            <Text style={styles.previewCounter}>
              {previewPosition + 1} / {filledImageIndexes.length}
            </Text>

            <View style={{ width: 42 }} />
          </View>

          <View style={styles.previewImageWrap}>
            {previewIndex !== null && images[previewIndex] && (
              <Image
                source={{ uri: images[previewIndex].uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            )}

            {previewPosition > 0 && (
              <TouchableOpacity
                style={[styles.previewNav, { left: 12 }]}
                onPress={showPrevImage}
              >
                <Ionicons name="chevron-back" size={26} color="white" />
              </TouchableOpacity>
            )}

            {previewPosition < filledImageIndexes.length - 1 && (
              <TouchableOpacity
                style={[styles.previewNav, { right: 12 }]}
                onPress={showNextImage}
              >
                <Ionicons name="chevron-forward" size={26} color="white" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.previewActionBtn}
              onPress={replacePreviewImage}
            >
              <Ionicons name="swap-horizontal" size={20} color="#111827" />
              <Text style={styles.previewActionText}>Replace</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.previewActionBtn, styles.previewRemoveBtn]}
              onPress={removePreviewImage}
            >
              <Ionicons name="trash-outline" size={20} color="white" />
              <Text style={[styles.previewActionText, { color: "white" }]}>
                Remove
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    paddingTop: Platform.OS === "android" ? 50 : 20,
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: { flex: 1, alignItems: "center", paddingHorizontal: 12 },
  headerTitle: { color: "white", fontSize: 20, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  saveTopBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FCD34D",
    justifyContent: "center",
    alignItems: "center",
  },
  formCard: {
    backgroundColor: "white",
    margin: 14,
    borderRadius: 16,
    padding: 18,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  sectionHeader: { marginBottom: 16, marginTop: 10 },
  sectionTitle: { fontSize: 22, fontWeight: "800", color: "#111827" },
  yellowLine: {
    width: 38,
    height: 4,
    backgroundColor: "#FFC107",
    borderRadius: 10,
    marginTop: 8,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  inputContainer: { flex: 1, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 8 },
  required: { color: "#EF4444" },
  inputBox: {
    height: 56,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "white",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pickerBox: {
    height: 56,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "white",
  },
  input: { flex: 1, fontSize: 14, color: "#111827" },
  placeholder: { color: "#94A3B8", fontSize: 14 },
  notesBox: { height: 100, alignItems: "flex-start", paddingTop: 14 },
  notesInput: { textAlignVertical: "top", height: "100%" },
  counter: { textAlign: "right", color: "#94A3B8", marginBottom: 20 },
  imageHint: {
    fontSize: 12,
    color: "#64748B",
    marginTop: -6,
    marginBottom: 12,
  },
  imageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  imageSlot: {
    width: 60,
    height: 60,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imageSlotFilled: {
    borderStyle: "solid",
    borderColor: "#FFC107",
    borderWidth: 1.5,
  },
  addPhoto: { fontSize: 9, color: "#64748B", marginTop: 4 },
  preview: { width: "100%", height: "100%", borderRadius: 12 },
  expandBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(10,22,40,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  noticeBox: {
    height: 56,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noticeText: { fontSize: 13, color: "#64748B", flexShrink: 1 },
  statusRow: { gap: 4, marginTop: 6 },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
    marginBottom: 10,
  },
  activeAvailable: { backgroundColor: "#F0FDF4", borderColor: "#22C55E" },
  activeRent: { backgroundColor: "#FFFBEB", borderColor: "#F59E0B" },
  activeService: { backgroundColor: "#FEF2F2", borderColor: "#EF4444" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  statusTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  statusSub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  lockedBox: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  lockedText: {
    color: "#92400E",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  bottomButtons: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#0F2554",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  cancelText: { color: "#0F2554", fontSize: 16, fontWeight: "700" },
  saveBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#FFC107",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: "#111827", fontSize: 16, fontWeight: "800" },

  // Image source sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10,22,40,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  sheetSub: { fontSize: 13, color: "#64748B", marginTop: 4, marginBottom: 16 },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    marginBottom: 10,
  },
  sheetIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetOptionTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  sheetOptionSub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  sheetCancel: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  sheetCancelText: { fontSize: 15, fontWeight: "700", color: "#0F2554" },

  // Full-screen preview
  previewContainer: { flex: 1, backgroundColor: "#000" },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "android" ? 40 : 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  previewCloseBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewCounter: { color: "white", fontSize: 15, fontWeight: "700" },
  previewImageWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  previewImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.65 },
  previewNav: {
    position: "absolute",
    top: "50%",
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  previewActionBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#FFC107",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  previewRemoveBtn: { backgroundColor: "#EF4444" },
  previewActionText: { fontSize: 15, fontWeight: "700", color: "#111827" },
});
