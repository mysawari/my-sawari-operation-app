import { ScrollView, StyleSheet, View } from "react-native";
import colors from "../../theme/colors";
import Header from "../components/home/Header";
import QuickActions from "../components/home/QuickActions";
import StatsGrid from "../components/home/StatsGrid";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Header />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <StatsGrid />
        <QuickActions />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
