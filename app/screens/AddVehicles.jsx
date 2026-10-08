import { Feather, Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

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

// ── FIXED: REUSABLE SUB-COMPONENTS MOVED OUTSIDE THE MAIN SCREEN FUNCTION ──
const InputField = ({
  label,
  placeholder,
  icon,
  required = false,
  multiline = false,
  fullWidth = false,
  value,
  onChangeText,
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
        maxLength={multiline ? 200 : undefined}
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

export default function AddVehicleScreen() {
  const router = useRouter();
  const { token } = useAuthStore();

  const [loading, setLoading] = useState(false);

  const [category, setCategory] = useState("");
  const [vehicleName, setVehicleName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [transmission, setTransmission] = useState("");

  const isCarCategory = category === "car";
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

  const [vehicleStatus, setVehicleStatus] = useState("available");
  const [notes, setNotes] = useState("");

  const [regDate, setRegDate] = useState(null);
  const [insuranceDate, setInsuranceDate] = useState(null);
  const [pucDate, setPucDate] = useState(null);
  const [fitnessDate, setFitnessDate] = useState(null);

  const [showPicker, setShowPicker] = useState(false);
  const [selectedDateField, setSelectedDateField] = useState("");

  const [images, setImages] = useState([null, null, null, null, null]);

  const handleSaveVehicle = async () => {
    try {
      if (
        !category ||
        !vehicleName ||
        !vehicleNumber ||
        !manufacturer ||
        (isCarCategory && !vehicleType) ||
        !fuelType ||
        !transmission ||
        !seatingCapacity
      ) {
        Alert.alert("Validation Error", "Please fill all required fields");
        return;
      }

      setLoading(true);

      const formData = new FormData();
      formData.append("vehicleName", vehicleName);
      formData.append("displayName", displayName);
      formData.append("vehicleNumber", vehicleNumber.toUpperCase());
      formData.append("manufacturer", manufacturer);
      formData.append("model", model || "");
      formData.append("variant", variant || "");
      if (vehicleType) {
        formData.append("vehicleType", vehicleType);
      }
      formData.append("category", category);
      formData.append("fuelType", fuelType);
      formData.append("transmission", transmission);
      formData.append("seatingCapacity", seatingCapacity.toString());
      formData.append("color", color || "");
      formData.append("chassisNumber", chassisNumber || "");
      formData.append("engineNumber", engineNumber || "");
      formData.append("engineCapacity", engineCapacity || "");
      formData.append("mileage", mileage || "");
      formData.append("ac", ac || "");
      
      formData.append("carPlay", carPlay || "");
      formData.append("bluetooth", bluetooth || "");
      formData.append("touchscreen", touchscreen || "");
      formData.append("usbCharging", usbCharging || "");
      formData.append("sunroof", sunroof || "");

      formData.append("airbags", airbags || "");
      formData.append("absEbd", absEbd || "");
      formData.append("rearParkingSensors", rearParkingSensors || "");
      formData.append("rearCamera", rearCamera || "");
      formData.append("gps", gps || "");

      formData.append("digitalDisplay", digitalDisplay || "");
      formData.append("bikeAbs", bikeAbs || "");
      formData.append("discBrakes", discBrakes || "");
      formData.append("cbs", cbs || "");

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
        const filename = uri.split("/").pop() || `vehicle-${index}.jpg`;
        formData.append("images", {
          uri,
          name: filename,
          type: "image/jpeg",
        });
      });

      const response = await api.post("/vehicles/create", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      Alert.alert(
        "Success",
        response.data.message || "Vehicle added successfully",
      );
      router.back();
    } catch (error) {
      console.log("CREATE VEHICLE ERROR:", error?.response?.data?.message || error?.message);
      Alert.alert(
        "Error",
        error?.response?.data?.message || "Vehicle creation failed",
      );
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
              <Text style={styles.headerTitle}>Add Vehicle</Text>
              <Text style={styles.headerSub}>
                Add new vehicle to your fleet
              </Text>
            </View>

            <TouchableOpacity
              style={styles.saveTopBtn}
              onPress={handleSaveVehicle}
              disabled={loading}
            >
              <Ionicons name="save-outline" size={18} color="#0A1628" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <View style={styles.formCard}>
            <SectionTitle title="Vehicle Information" />

            <View style={styles.row}>
              <PickerField
                label="Vehicle Category"
                required
                selectedValue={category}
                onValueChange={setCategory}
                options={[
                  { label: "Select Category", value: "" },
                  { label: "Car", value: "car" },
                  { label: "Bike", value: "bike" },
                ]}
              />
              <InputField
                label="Vehicle Name"
                placeholder="e.g. Scorpio N"
                icon="car-outline"
                required
                value={vehicleName}
                onChangeText={setVehicleName}
              />
            </View>

            <View style={styles.row}>
              <InputField
                label="Vehicle Number"
                placeholder="e.g. PB10XX1234"
                icon="reader-outline"
                required
                value={vehicleNumber}
                onChangeText={setVehicleNumber}
              />
              <InputField
                label="Display Name (Optional)"
                placeholder="e.g. Innova"
                icon="text-outline"
                value={displayName}
                onChangeText={setDisplayName}
              />
            </View>

            <View style={styles.row}>
              <PickerField
                label="Manufacturer"
                selectedValue={manufacturer}
                onValueChange={setManufacturer}
                options={[
                  { label: "Select manufacturer", value: "" },
                  { label: "Maruti Suzuki", value: "Maruti Suzuki" },
                  { label: "Hyundai", value: "Hyundai" },
                  { label: "Tata", value: "Tata" },
                  { label: "Mahindra", value: "Mahindra" },
                  { label: "Toyota", value: "Toyota" },
                  { label: "Honda", value: "Honda" },
                  { label: "Kia", value: "Kia" },
                  { label: "Renault", value: "Renault" },
                  { label: "Nissan", value: "Nissan" },
                  { label: "MG", value: "MG" },
                  { label: "Volkswagen", value: "Volkswagen" },
                  { label: "Skoda", value: "Skoda" },
                  { label: "Ford", value: "Ford" },
                  { label: "Chevrolet", value: "Chevrolet" },
                  { label: "Jeep", value: "Jeep" },
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

              {isCarCategory ? (
                <PickerField
                  label="Vehicle Type"
                  selectedValue={vehicleType}
                  onValueChange={setVehicleType}
                  required
                  options={[
                    { label: "Select vehicle type", value: "" },
                    { label: "SUV", value: "SUV" },
                    { label: "Sedan", value: "Sedan" },
                    { label: "Hatchback", value: "Hatchback" },
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
                selectedValue={fuelType}
                onValueChange={setFuelType}
                required
                options={[
                  { label: "Select fuel type", value: "" },
                  { label: "Petrol", value: "Petrol" },
                  { label: "Diesel", value: "Diesel" },
                  { label: "Electric", value: "Electric" },
                ]}
              />

              <PickerField
                label="Transmission"
                selectedValue={transmission}
                onValueChange={setTransmission}
                required
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
                placeholder="Enter capacity"
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
                  { label: "Select color", value: "" },
                  { label: "White", value: "White" },
                  { label: "Black", value: "Black" },
                  { label: "Silver", value: "Silver" },
                  { label: "Blue", value: "Blue" },
                  { label: "Red", value: "Red" },
                  { label: "Grey", value: "Grey" },
                ]}
              />
            </View>

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

            <View style={styles.uploadBox}>
              <Feather name="upload-cloud" size={34} color="#2563EB" />
              <Text style={styles.uploadTitle}>Upload Vehicle Photos</Text>
              <Text style={styles.uploadSub}>
                You can upload up to 5 images
              </Text>
            </View>

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
              Vehicle Status<Text style={styles.required}> *</Text>
            </Text>

            <View style={styles.statusRow}>
              <TouchableOpacity
                style={[
                  styles.statusCard,
                  vehicleStatus === "available" && styles.activeAvailable,
                ]}
                onPress={() => setVehicleStatus("available")}
              >
                <View style={[styles.radio, { borderColor: "#22C55E" }]} />
                <View>
                  <Text style={styles.statusTitle}>Available</Text>
                  <Text style={styles.statusSub}>Ready for rent</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.statusCard,
                  vehicleStatus === "rent" && styles.activeRent,
                ]}
                onPress={() => setVehicleStatus("rent")}
              >
                <View style={[styles.radio, { borderColor: "#F59E0B" }]} />
                <View>
                  <Text style={styles.statusTitle}>On Rent</Text>
                  <Text style={styles.statusSub}>Currently rented</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.statusCard,
                  vehicleStatus === "service" && styles.activeService,
                ]}
                onPress={() => setVehicleStatus("service")}
              >
                <View style={[styles.radio, { borderColor: "#EF4444" }]} />
                <View>
                  <Text style={styles.statusTitle}>Under Service</Text>
                  <Text style={styles.statusSub}>Not available</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.bottomButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => router.back()}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, loading && { opacity: 0.7 }]}
                onPress={handleSaveVehicle}
                disabled={loading}
              >
                <Text style={styles.saveText}>
                  {loading ? "Saving..." : "Save Vehicle"}
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
