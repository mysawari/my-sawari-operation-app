import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import useAuthStore from "../../../store/authStore";
import colors from "../../../theme/colors";
import SideMenu from "./SideMenu";

export default function Header() {
  const [menuVisible, setMenuVisible] = useState(false);

  const user = useAuthStore((state) => state.user);

  return (
    <>
      <LinearGradient
        colors={[colors.primaryDark, colors.primary]}
        style={styles.container}
      >
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="menu" size={28} color="white" />
        </TouchableOpacity>

        <View style={styles.centerContent}>
          <Text style={styles.welcomeText}>
            Welcome, {user?.fullName || "User"}
          </Text>

          <Text style={styles.logo}>
            My<Text style={{ color: colors.accent }}>Sawari</Text>.in
          </Text>
        </View>

        <TouchableOpacity style={styles.bell}>
          <Ionicons name="notifications-outline" size={24} color="white" />
        </TouchableOpacity>
      </LinearGradient>

      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  menuBtn: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  centerContent: {
    flex: 1,
    alignItems: "center",
  },

  welcomeText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },

  logo: {
    color: "white",
    fontSize: 24,
    fontWeight: "800",
  },

  bell: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
});
