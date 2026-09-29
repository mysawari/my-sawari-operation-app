import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colors from "../../theme/colors";

export default function TabsLayout() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: "#64748B",
          sceneContainerStyle: {
            backgroundColor: "#fff",
          },
          tabBarStyle: {
            height: 85,
            paddingBottom: 10,
            paddingTop: 10,
            borderTopWidth: 0,
            elevation: 12,
            shadowOpacity: 0.1,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            href: "/(tabs)/home",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="bookings"
          options={{
            title: "Bookings",
            href: "/(tabs)/new-booking",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="new-booking"
          options={{
            href: "../menu/lead/NewBooking",
            title: "",
            tabBarLabel: () => null,
            tabBarIcon: () => (
              <View
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: 35,
                  backgroundColor: "#FFC107",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 30,
                  shadowColor: "#000",
                  shadowOffset: {
                    width: 0,
                    height: 6,
                  },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 10,
                }}
              >
                <Ionicons name="add" size={36} color="#111" />
              </View>
            ),
          }}
        />

      <Tabs.Screen
  name="maintenance"
  options={{
    title: "Maintenance",
    href: "/(tabs)/maintenance",
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="build-outline" size={size} color={color} />
    ),
  }}
/>

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            href: "/(tabs)/profile",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}
