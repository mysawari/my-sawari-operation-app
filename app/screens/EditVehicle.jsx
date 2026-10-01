import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

// Must match the maxlength on the backend model / controller.
const DISPLAY_NAME_MAX_LENGTH = 100;

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
        {options.map((item, index) => (
          <Picker.Item key={index} label={item.label} value={item.value} />
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

const SectionTitle = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.yellowLine} />
  </View>
);

// Vehicle Type only applies to the "car" category. Kept as a constant so
// both the Picker options and the backend-mirrored validation logic below
// stay in sync with what the server actually accepts.
const CAR_VEHICLE_TYPES = [
  "SUV",
  "Sedan",
  "Hatchback",
  "Luxury",
  "Tempo Traveller",
  "Mini Bus",
  "Bus",
];

export default function EditVehicleScreen() {
  const router = useRouter();
  const { vehicleId } = useLocalSearchParams();
  const { token, user } = useAuthStore();

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
  const [notes, setNotes] = useState("");
  const [vehicleStatus, setVehicleStatus] = useState("available");
  const [pricePerDay, setPricePerDay] = useState("");

  // Vehicle Type is a car-only concept on the backend. Whenever category
  // isn't "car" (e.g. "bike", or unset), treat vehicleType as not required
  // and never send it - this mirrors the server's own validation rule.
  const isCarCategory = category === "car";

  // Dates
  const [regDate, setRegDate] = useState(null);
  const [insuranceDate, setInsuranceDate] = useState(null);
  const [pucDate, setPucDate] = useState(null);
  const [fitnessDate, setFitnessDate] = useState(null);

  const [showPicker, setShowPicker] = useState(false);
  const [selectedDateField, setSelectedDateField] = useState("");

  // Images
  const [images, setImages] = useState([null, null, null, null, null]);

  useEffect(() => {
    if (vehicleId && token) {
      fetchVehicleDetails();
    }
  }, [vehicleId, token]);

  const fetchVehicleDetails = async () => {
    try {
      setLoading(true);

      const res = await api.get(`/vehicles/${vehicleId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const vehicle = res.data.data;

      setVehicleName(vehicle.vehicleName || "");
      setDisplayName(vehicle.displayName || "");
      setVehicleNumber(vehicle.vehicleNumber || "");
      setManufacturer(vehicle.manufacturer || "");
      setModel(vehicle.model || "");
      setVariant(vehicle.variant || "");
      setPricePerDay(vehicle.pricePerDay?.toString() || "");

      // OPTIONAL CATEGORY
      setCategory(vehicle.category || "");

      // Only hydrate vehicleType when the vehicle is actually a car.
      setVehicleType(
        vehicle.category === "car" ? vehicle.vehicleType || "" : "",
      );

      setFuelType(vehicle.fuelType || "");
      setTransmission(vehicle.transmission || "");
      setSeatingCapacity(vehicle.seatingCapacity?.toString() || "");
      setColor(vehicle.color || "");
      setChassisNumber(vehicle.chassisNumber || "");
      setEngineNumber(vehicle.engineNumber || "");
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

      if (vehicle.images && vehicle.images.length > 0) {
        const incomingImages = vehicle.images.map((img) => img.url || img);

        const completeSlots = [...incomingImages, ...Array(5).fill(null)].slice(
          0,
          5,
        );

        setImages(completeSlots);
      }
    } catch (error) {
      console.log("FETCH ERROR DETAILS:", error?.response?.data?.message || error?.message);

      Alert.alert("Error", "Failed to fetch vehicle details.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return "";
    return date.toLocaleDateString("en-IN");
  };

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

  const pickImage = async (index) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      const updated = [...images];

      updated[index] = result.assets[0].uri;

      setImages(updated);
    }
  };

  // Switching away from "car" clears any previously-selected car body type
  // so stale state can never get sent to the backend for a bike.
  const handleCategoryChange = (value) => {
    setCategory(value);

    if (value !== "car") {
      setVehicleType("");
    }
  };

  const handleUpdateVehicle = async () => {
    try {
      if (
        !vehicleName ||
        !vehicleNumber ||
        !manufacturer ||
        !fuelType ||
        !transmission ||
        !seatingCapacity
      ) {
        Alert.alert(
          "Validation Error",
          "Please complete all mandatory parameters highlighted.",
        );

        return;
      }

      if (displayName.trim().length > DISPLAY_NAME_MAX_LENGTH) {
        Alert.alert(
          "Validation Error",
          `Display name cannot exceed ${DISPLAY_NAME_MAX_LENGTH} characters.`,
        );

        return;
      }

      // Vehicle Type is only mandatory for cars.
      if (isCarCategory && !vehicleType) {
        Alert.alert(
          "Validation Error",
          "Please select a Vehicle Type for this car.",
        );

        return;
      }

      setLoading(true);

      const formData = new FormData();

      formData.append("vehicleName", vehicleName);
      // Always sent (even empty) so employees can clear a display name.
      formData.append("displayName", displayName.trim());
      formData.append("vehicleNumber", vehicleNumber.toUpperCase());
      formData.append("manufacturer", manufacturer);
      formData.append("model", model || "");
      formData.append("variant", variant || "");
      formData.append("pricePerDay", pricePerDay || "0");

      // OPTIONAL CATEGORY
      if (category) {
        formData.append("category", category);
      }

      // Only send vehicleType for cars.
      if (isCarCategory) {
        formData.append("vehicleType", vehicleType);
      }

      formData.append("fuelType", fuelType);
      formData.append("transmission", transmission);
      formData.append("seatingCapacity", seatingCapacity.toString());
      formData.append("color", color || "");
      formData.append("chassisNumber", chassisNumber || "");
      formData.append("engineNumber", engineNumber || "");
      formData.append("notes", notes || "");
      formData.append("status", vehicleStatus);

      if (regDate) {
        formData.append("registrationDate", regDate.toISOString());
      }

      if (insuranceDate) {
        formData.append("insuranceValidUpto", insuranceDate.toISOString());
      }

      if (pucDate) {
        formData.append("pucValidUpto", pucDate.toISOString());
      }

      if (fitnessDate) {
        formData.append("fitnessValidUpto", fitnessDate.toISOString());
      }

      images.filter(Boolean).forEach((uri, index) => {
        if (uri.startsWith("http")) {
          formData.append("existingImages", uri);
        } else {
          const filename = uri.split("/").pop() || `vehicle-${index}.jpg`;

          formData.append("images", {
            uri,
            name: filename,
            type: "image/jpeg",
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
      console.log("UPDATE ERROR:", error?.response?.data?.message || error?.message);

      Alert.alert(
        "Update Failed",
        error.response?.data?.message || "Failed to update vehicle.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#001B45" />

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
              style={styles.saveTopBtn}
              onPress={handleUpdateVehicle}
              disabled={loading}
            >
              <Ionicons name="save-outline" size={18} color="#0A1628" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 40,
          }}
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
                selectedValue={manufacturer}
                onValueChange={setManufacturer}
                options={[
                  {
                    label: "Select Manufacturer",
                    value: "",
                  },
                  { label: "Toyota", value: "Toyota" },
                  { label: "Mahindra", value: "Mahindra" },
                  {
                    label: "Maruti Suzuki",
                    value: "Maruti Suzuki",
                  },
                  { label: "Hyundai", value: "Hyundai" },
                  { label: "Tata", value: "Tata" },
                  { label: "Kia", value: "Kia" },
                  { label: "Honda", value: "Honda" },
                  { label: "MG", value: "MG" },
                  { label: "Renault", value: "Renault" },
                  { label: "Nissan", value: "Nissan" },
                  { label: "Skoda", value: "Skoda" },
                  {
                    label: "Volkswagen",
                    value: "Volkswagen",
                  },
                  { label: "Jeep", value: "Jeep" },
                  {
                    label: "Force Motors",
                    value: "Force Motors",
                  },
                  { label: "Isuzu", value: "Isuzu" },
                  { label: "Citroen", value: "Citroen" },
                  { label: "BYD", value: "BYD" },
                  { label: "BMW", value: "BMW" },
                  {
                    label: "Mercedes-Benz",
                    value: "Mercedes-Benz",
                  },
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
                value={pricePerDay}
                onChangeText={setPricePerDay}
              />
            </View>

            {/* CATEGORY + VEHICLE TYPE */}
            <View style={styles.row}>
              <PickerField
                label="Category"
                selectedValue={category}
                onValueChange={handleCategoryChange}
                options={[
                  {
                    label: "Select category",
                    value: "",
                  },
                  {
                    label: "Bike",
                    value: "bike",
                  },
                  {
                    label: "Car",
                    value: "car",
                  },
                ]}
              />

              {isCarCategory ? (
                <PickerField
                  label="Vehicle Type"
                  selectedValue={vehicleType}
                  onValueChange={setVehicleType}
                  required
                  options={[
                    {
                      label: "Select vehicle type",
                      value: "",
                    },
                    ...CAR_VEHICLE_TYPES.map((type) => ({
                      label: type,
                      value: type,
                    })),
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
                      Not applicable for bikes
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.row}>
              <PickerField
                label="Fuel Type"
                selectedValue={fuelType}
                onValueChange={setFuelType}
                required
                options={[
                  {
                    label: "Select fuel type",
                    value: "",
                  },
                  {
                    label: "Petrol",
                    value: "Petrol",
                  },
                  {
                    label: "Diesel",
                    value: "Diesel",
                  },
                  {
                    label: "Electric",
                    value: "Electric",
                  },
                  {
                    label: "CNG",
                    value: "CNG",
                  },
                  {
                    label: "Hybrid",
                    value: "Hybrid",
                  },
                ]}
              />

              <PickerField
                label="Transmission"
                selectedValue={transmission}
                onValueChange={setTransmission}
                required
                options={[
                  {
                    label: "Select transmission",
                    value: "",
                  },
                  {
                    label: "Manual",
                    value: "Manual",
                  },
                  {
                    label: "Automatic",
                    value: "Automatic",
                  },
                ]}
              />
            </View>

            <View style={styles.row}>
              <InputField
                label="Seating Capacity"
                placeholder="Enter seating capacity"
                icon="people-outline"
                required
                value={seatingCapacity}
                onChangeText={setSeatingCapacity}
              />

              <PickerField
                label="Color"
                selectedValue={color}
                onValueChange={setColor}
                options={[
                  {
                    label: "Select color",
                    value: "",
                  },
                  { label: "White", value: "White" },
                  { label: "Black", value: "Black" },
                  { label: "Silver", value: "Silver" },
                ]}
              />
            </View>

            <InputField
              label="Chassis Number (Optional)"
              placeholder="Enter chassis number"
              icon="card-outline"
              fullWidth
              value={chassisNumber}
              onChangeText={setChassisNumber}
            />

            <InputField
              label="Engine Number (Optional)"
              placeholder="Enter engine number"
              icon="build-outline"
              fullWidth
              value={engineNumber}
              onChangeText={setEngineNumber}
            />

            <SectionTitle title="Vehicle Images" />

            <View style={styles.imageRow}>
              {images.map((img, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.imageSlot}
                  onPress={() => pickImage(index)}
                >
                  {img ? (
                    <Image source={{ uri: img }} style={styles.preview} />
                  ) : (
                    <>
                      <Ionicons
                        name="image-outline"
                        size={24}
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
              Vehicle Status
              <Text style={styles.required}> *</Text>
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
                ].map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={[
                      styles.statusCard,
                      vehicleStatus === item.value && item.active,
                    ]}
                    onPress={() => setVehicleStatus(item.value)}
                  >
                    <View
                      style={[
                        styles.radio,
                        {
                          borderColor: item.color,
                        },
                      ]}
                    />

                    <View>
                      <Text style={styles.statusTitle}>{item.title}</Text>

                      <Text style={styles.statusSub}>{item.sub}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View
                style={{
                  backgroundColor: "#FEF3C7",
                  borderWidth: 1,
                  borderColor: "#FCD34D",
                  borderRadius: 12,
                  padding: 14,
                  marginTop: 8,
                }}
              >
                <Text
                  style={{
                    color: "#92400E",
                    fontSize: 14,
                    fontWeight: "600",
                    textAlign: "center",
                  }}
                >
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
            onDismiss={() => onDateChange({type: "dismissed"})}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
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
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  headerTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "800",
  },
  headerSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    marginTop: 2,
  },
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
  sectionHeader: {
    marginBottom: 16,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  yellowLine: {
    width: 38,
    height: 4,
    backgroundColor: "#FFC107",
    borderRadius: 10,
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  inputContainer: {
    flex: 1,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
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
  input: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },
  placeholder: {
    color: "#94A3B8",
    fontSize: 14,
  },
  notesBox: {
    height: 100,
    alignItems: "flex-start",
    paddingTop: 14,
  },
  notesInput: {
    textAlignVertical: "top",
  },
  counter: {
    textAlign: "right",
    color: "#94A3B8",
    marginBottom: 20,
  },
  uploadBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 14,
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E3A8A",
    marginTop: 10,
  },
  uploadSub: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
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
  },
  addPhoto: {
    fontSize: 9,
    color: "#64748B",
    marginTop: 4,
  },
  preview: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
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
  noticeText: {
    fontSize: 13,
    color: "#64748B",
  },
  statusRow: {
    gap: 4,
    marginTop: 6,
  },
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
  activeAvailable: {
    backgroundColor: "#F0FDF4",
    borderColor: "#22C55E",
  },
  activeRent: {
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
  },
  activeService: {
    backgroundColor: "#FEF2F2",
    borderColor: "#EF4444",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  statusSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  bottomButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
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
  cancelText: {
    color: "#0F2554",
    fontSize: 16,
    fontWeight: "700",
  },
  saveBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#FFC107",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
});
