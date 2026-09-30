const fs = require('fs');

const path = 'app/screens/ExtensionRequests.jsx';
let content = fs.readFileSync(path, 'utf8');

// Replace extensionRequestsData import with api
content = content.replace(
  'import { extensionRequestsData } from "../../constants/homeData";',
  'import api from "../../services/api";\nimport { Modal, TextInput } from "react-native";'
);

// Replace state
content = content.replace(
  /const \[filter, setFilter\] = useState\("pending"\);/,
  `const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectItem, setRejectItem] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchExtensions = async () => {
    try {
      setLoading(true);
      const response = await api.get("/extensions");
      if (response.data?.success) {
        const mapped = response.data.data.map(r => {
          const booking = r.bookingId;
          const customerName = booking?.customerId?.name || booking?.customerName || 'Unknown Customer';
          const customerPhone = booking?.customerId?.mobile || booking?.customerPhone || 'Unknown Mobile';
          const vehicleName = booking?.vehicleId?.vehicleName || booking?.vehicleName || 'Unknown Vehicle';

          return {
            id: r._id,
            rentalId: r.bookingId?._id || r.bookingId,
            vehicle: {
              name: vehicleName,
              number: r.bookingId?.vehicleNumber || '',
            },
            customer: {
              name: customerName,
              phone: customerPhone,
            },
            fromDate: r.bookingId?.toDate ? new Date(r.bookingId.toDate).toLocaleDateString() : 'N/A',
            fromTime: r.bookingId?.dropTime || 'N/A',
            toDate: r.newToDate ? new Date(r.newToDate).toLocaleDateString() : 'N/A',
            rawToDate: r.newToDate,
            toTime: r.bookingId?.dropTime || 'N/A', // Assuming same drop time
            extraAmount: r.additionalAmount || 0,
            status: r.status,
            createdAt: r.createdAt
          };
        });
        setRequests(mapped.reverse());
      }
    } catch (err) {
      console.log("Error fetching extensions:", err);
    } finally {
      setLoading(false);
    }
  };

  useMemo(() => {
    fetchExtensions();
  }, []);`
);

// update counts logic
content = content.replace(
  /const counts = useMemo\(\s*\(\) =>\s*FILTERS.reduce\(\(acc, f\) => \{\s*acc\[f.key\] = extensionRequestsData.filter\(\(r\) => r.status === f.key\).length;\s*return acc;\s*\}, \{\}\),\s*\[\]\s*\);/,
  `const counts = useMemo(
    () =>
      FILTERS.reduce((acc, f) => {
        acc[f.key] = requests.filter((r) => r.status === f.key).length;
        return acc;
      }, {}),
    [requests],
  );`
);

content = content.replace(
  /const visible = extensionRequestsData.filter\(\(r\) => r.status === filter\);/,
  'const visible = requests.filter((r) => r.status === filter);'
);

content = content.replace(
  /const updateStatus = \(id, status\) => \{\s*Alert.alert\("Success", \`Request \$\{status\}\`\);\s*\};/,
  `const updateStatus = async (id, status, rentalId, newDropDate) => {
    try {
      await api.patch(\`/extensions/\${id}/status\`, { status });
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r)),
      );

      if (status === "approved") {
        const queryParams = new URLSearchParams({ id: rentalId });
        if (newDropDate) queryParams.append("newDropDate", newDropDate);
        router.push(\`/components/activeRental/edit-rental?\${queryParams.toString()}\`);
      }
    } catch (err) {
      console.log("Error updating status:", err);
      Alert.alert("Error", "Could not update status.");
    }
  };`
);

content = content.replace(
  /const handleAccept = \(item\) => \{\s*Alert.alert\([^\]]+\]\s*\);\s*\};/,
  `const handleAccept = (item) => {
    Alert.alert(
      "Accept extension?",
      \`\${item.customer.name}'s rental of \${item.vehicle.name} will be extended to \${item.toDate}, \${item.toTime}. Extra charge: ₹\${item.extraAmount}.\`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Accept", onPress: () => updateStatus(item.id, "approved", item.rentalId, item.rawToDate) },
      ],
    );
  };`
);

content = content.replace(
  /const handleDecline = \(item\) => \{\s*Alert.alert\([^\]]+\]\s*\);\s*\};/,
  `const handleDecline = (item) => {
    setRejectItem(item);
    setRejectReason("");
    setRejectModalVisible(true);
  };

  const confirmDecline = async () => {
    if (!rejectItem) return;
    try {
      await api.patch(\`/extensions/\${rejectItem.id}/status\`, { status: "rejected", rejectReason });
      setRequests((prev) =>
        prev.map((r) => (r.id === rejectItem.id ? { ...r, status: "rejected" } : r)),
      );
      setRejectModalVisible(false);
      setRejectItem(null);
    } catch (err) {
      console.log("Error declining:", err);
      Alert.alert("Error", "Could not update status.");
    }
  };`
);

content = content.replace(
  /<FlatList\s*data=\{visible\}\s*keyExtractor=\{.*?\}\s*renderItem=\{.*?\}\s*ListEmptyComponent=\{.*?\}\s*contentContainerStyle=\{styles.list\}\s*\/>/s,
  (match) => match + `\n\n      {/* Reject Modal */}
      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject Extension</Text>
            <Text style={styles.modalSub}>Provide a reason for rejection (this will be logged and visible to the customer).</Text>
            
            <TextInput
              style={styles.textInput}
              placeholder="e.g., Vehicle booked by another customer..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: "#F1F5F9" }]}
                onPress={() => {
                  setRejectModalVisible(false);
                  setRejectItem(null);
                }}
              >
                <Text style={{ color: "#475569", fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              
              <Pressable
                style={[styles.modalBtn, { backgroundColor: "#EF4444" }]}
                onPress={confirmDecline}
                disabled={!rejectReason.trim()}
              >
                <Text style={{ color: "#FFF", fontWeight: "600" }}>Confirm Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>`
);

content = content.replace(
  /}\);\s*$/,
  `  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFF', width: '85%', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  modalSub: { fontSize: 14, color: '#64748B', marginBottom: 16, lineHeight: 20 },
  textInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, fontSize: 15, color: '#0F172A', textAlignVertical: 'top', minHeight: 80 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 24 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }
});`
);

fs.writeFileSync(path, content);
