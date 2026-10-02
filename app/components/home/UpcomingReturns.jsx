import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../../services/api";
import useAuthStore from "../../../store/authStore";
import colors from "../../../theme/colors";

export default function UpcomingReturns() {
  const router = useRouter();
  const { token } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [returnsData, setReturnsData] = useState([]);

  useEffect(() => {
    if (token) {
      fetchUpcomingReturns();
    }
  }, [token]);

  const fetchUpcomingReturns = async () => {
    try {
      setLoading(true);

      const res = await api.get("/handover/active-handovers", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setReturnsData(res.data.data || []);
    } catch (error) {
      console.log("UPCOMING RETURNS ERROR:", error?.response?.data?.message || error?.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "-";

    return new Date(dateString).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getRemainingTime = (dropDateTime) => {
    if (!dropDateTime) return "-";

    const diff = new Date(dropDateTime) - new Date();

    if (diff <= 0) {
      return "Overdue";
    }

    const hrs = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hrs}h ${mins}m remaining`;
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!returnsData.length) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.heading}>Upcoming Returns</Text>
        </View>

        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No active returns available</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Upcoming Returns</Text>

        <TouchableOpacity onPress={() => router.push("/screens/Received")}>
          <Text style={styles.viewAll}>View All</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {returnsData.slice(0, 5).map((item, index) => {
          const vehicle = item.vehicle?.vehicleId || item.vehicle;

          return (
            <TouchableOpacity
              key={item._id}
              style={[
                styles.row,
                index === returnsData.length - 1 && {
                  borderBottomWidth: 0,
                },
              ]}
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: "/components/receiveCar/detail",
                  params: {
                    handoverId: item._id,
                  },
                })
              }
            >
              <Image
                source={{
                  uri: (() => {
                    const url = vehicle?.images?.[0]?.url;
                    if (!url || typeof url !== 'string') return "https://via.placeholder.com/100";
                    if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
                      if (!url.includes('q_auto') && !url.includes('w_')) {
                        return url.replace('/upload/', '/upload/q_auto,f_auto,w_300,c_limit/');
                      }
                    }
                    return url;
                  })(),
                }}
                style={styles.image}
                resizeMode="cover"
              />

              <View style={styles.leftContent}>
                <Text numberOfLines={1} style={styles.car}>
                  {vehicle?.vehicleName || "Unknown Vehicle"}
                </Text>

                <Text numberOfLines={1} style={styles.details}>
                  {vehicle?.vehicleNumber || "-"} •{" "}
                  {item.customer?.fullName || "-"}
                </Text>
              </View>

              <View style={styles.rightContent}>
                <Text style={styles.time}>
                  {formatDateTime(item.trip?.dropDateTime)}
                </Text>

                <Text style={styles.remaining}>
                  {getRemainingTime(item.trip?.dropDateTime)}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 30,
  },

  loaderWrap: {
    marginTop: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    elevation: 2,
  },

  emptyText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  heading: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
  },

  viewAll: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 14,
  },

  card: {
    backgroundColor: "white",
    borderRadius: 20,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  image: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
  },

  leftContent: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },

  car: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },

  details: {
    marginTop: 5,
    fontSize: 13,
    color: colors.textSecondary,
  },

  rightContent: {
    marginRight: 10,
    alignItems: "flex-end",
    minWidth: 110,
  },

  time: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 13,
  },

  remaining: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 12,
  },
});
