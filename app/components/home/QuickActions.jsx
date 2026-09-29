import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { quickActions } from "../../../constants/homeData";
import colors from "../../../theme/colors";

export default function QuickActions() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Quick Actions</Text>

      <View style={styles.grid}>
        {quickActions.map((item) => {
          const Icon = item.icon;

          return (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(item.route)}
            >
              <View style={[styles.iconWrap, { backgroundColor: item.bg }]}>
                <Icon name={item.iconName} size={24} color={item.color} />
              </View>

              <View style={styles.content}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>
              </View>

              <Ionicons name="chevron-forward" size={20} color="#64748B" />
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
    marginTop: 28,
  },
  heading: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: 16,
  },
  grid: {
    gap: 14,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    elevation: 3,
    shadowOpacity: 0.05,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    marginLeft: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 5,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});