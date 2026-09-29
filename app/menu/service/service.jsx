import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Platform,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import api from "../../../services/api";
import useAuthStore from "../../../store/authStore";

export default function ServiceVehiclesScreen() {
  const router = useRouter();
  const { token } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [vehicles, setVehicles] = useState([]);

  const fetchVehicles = async () => {
    try {
      const response = await api.get("/vehicle-return/service", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setVehicles(response.data?.data || []);
    } catch (error) {
      console.log("SERVICE VEHICLES ERROR:", error?.response?.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchVehicles();
  }, []);

  const markAvailable = async (vehicleId) => {
    try {
      const response = await api.put(
        `/vehicle-return/service/complete/${vehicleId}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.data.success) {
        fetchVehicles();
      }
    } catch (error) {
      console.log("MARK AVAILABLE ERROR:", error?.response?.data);
      Alert.alert(
        "Error",
        error?.response?.data?.message ||
          "Failed to mark vehicle as available.",
      );
    }
  };

  const handleMarkAvailable = (vehicleId) => {
    Alert.alert("Complete Service", "Mark this vehicle as available?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Mark Available",
        onPress: () => markAvailable(vehicleId),
      },
    ]);
  };

  const renderVehicle = ({ item }) => (
    <View style={styles.card}>
      {/* Compact Image Block */}
      <View style={styles.imageContainer}>
        <Image
          source={{
            uri: item.images?.[0]?.url || "https://via.placeholder.com/150",
          }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.serviceBadge}>
          <Text style={styles.serviceText}>SERVICE</Text>
        </View>
      </View>

      {/* Right Side Info Content */}
      <View style={styles.cardContent}>
        <View>
          <View style={styles.titleRow}>
            <Text style={styles.vehicleName} numberOfLines={1}>
              {item.vehicleName}
            </Text>
            <Text style={styles.vehicleNumber}>{item.vehicleNumber}</Text>
          </View>

          <View style={styles.detailsGrid}>
            <View style={styles.metaRow}>
              <Text style={styles.label}>Make/Model:</Text>
              <Text style={styles.value} numberOfLines={1}>
                {item.manufacturer} {item.model ? `• ${item.model}` : ""}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.label}>Reason:</Text>
              <Text style={[styles.value, styles.reasonText]} numberOfLines={1}>
                {item.maintenance?.reason || "-"}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.label}>Remaining:</Text>
              <Text
                style={[
                  styles.value,
                  {
                    color:
                      item.maintenance?.remainingDays > 0
                        ? "#D97706"
                        : "#16A34A",
                  },
                ]}
              >
                {item.maintenance?.remainingDays || 0} Days (
                {item.maintenance?.estimatedDays || 0} total)
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.label}>By:</Text>
              <Text style={styles.value} numberOfLines={1}>
                {item.maintenance?.markedBy?.fullName || "-"}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={styles.completeBtn}
          onPress={() => handleMarkAvailable(item._id)}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={styles.completeBtnText}>Mark Available</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.loaderContainer]}>
        <StatusBar backgroundColor="#001B45" barStyle="light-content" />
        <ActivityIndicator size="large" color="#001B45" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#001B45" barStyle="light-content" />

      <LinearGradient colors={["#001B45", "#002B6B"]} style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Vehicles On Service</Text>

        <View style={{ width: 40 }} />
      </LinearGradient>

      <FlatList
        data={vehicles}
        keyExtractor={(item) => item._id}
        renderItem={renderVehicle}
        contentContainerStyle={{
          padding: 12,
          paddingBottom: 40,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#001B45"
          />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="construct-outline" size={44} color="#94A3B8" />
            </View>
            <Text style={styles.emptyText}>No Vehicles Under Service</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  loaderContainer: {
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 14,
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 12 : 12,
  },

  backButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    flexDirection: "row",
    marginBottom: 10,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },

  imageContainer: {
    position: "relative",
    width: 115,
    backgroundColor: "#F1F5F9",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  serviceBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  serviceText: {
    color: "#DC2626",
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 0.3,
  },

  cardContent: {
    flex: 1,
    padding: 10,
    justifyContent: "space-between",
  },

  titleRow: {
    marginBottom: 4,
  },

  vehicleName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },

  vehicleNumber: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 1,
  },

  detailsGrid: {
    gap: 2,
    marginBottom: 8,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  label: {
    width: 80,
    color: "#64748B",
    fontSize: 12,
    fontWeight: "500",
  },

  value: {
    flex: 1,
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },

  reasonText: {
    color: "#DC2626",
    fontWeight: "500",
  },

  completeBtn: {
    backgroundColor: "#16A34A",
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },

  completeBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    marginLeft: 6,
  },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 140,
    paddingHorizontal: 32,
  },

  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  emptyText: {
    fontSize: 15,
    color: "#64748B",
    fontWeight: "600",
  },
});
