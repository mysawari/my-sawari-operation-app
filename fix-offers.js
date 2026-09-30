const fs = require('fs');
const path = 'app/menu/offers/index.jsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('validUpto')) {
  // Add state
  content = content.replace(
    /const \[validFor, setValidFor\] = useState\(""\);/,
    `const [validFor, setValidFor] = useState("");
  const [validUpto, setValidUpto] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);`
  );

  // Add handlers
  content = content.replace(
    /const createOffer = async \(\) => \{/,
    `const onDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const current = new Date(validUpto);
      current.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setValidUpto(current);
    }
  };

  const onTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const current = new Date(validUpto);
      current.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setValidUpto(current);
    }
  };

  const createOffer = async () => {`
  );

  // Modify payload
  content = content.replace(
    /validFor: Number\(validFor\),/,
    `validUpto: validUpto.toISOString(),`
  );

  // Add imports
  content = content.replace(
    /import \{ Ionicons, MaterialCommunityIcons \} from "@expo\/vector-icons";/,
    `import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";\nimport DateTimePicker from "@react-native-community/datetimepicker";`
  );
  
  // modify UI for datetime picker
  // replace validFor input with datetime picker buttons
  content = content.replace(
    /<Text style=\{styles\.label\}>Valid For \(Days\)\*<\/Text>\s*<TextInput\s*style=\{styles\.input\}\s*value=\{validFor\}\s*onChangeText=\{setValidFor\}\s*placeholder="e\.g\. 7"\s*keyboardType="numeric"\s*\/>/,
    `<Text style={styles.label}>Valid Upto*</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                style={[styles.input, { flex: 1, justifyContent: "center" }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={{ color: C.text }}>{validUpto.toLocaleDateString()}</Text>
              </Pressable>
              <Pressable
                style={[styles.input, { flex: 1, justifyContent: "center" }]}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={{ color: C.text }}>
                  {validUpto.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </Pressable>
            </View>
            
            {showDatePicker && (
              <DateTimePicker
                value={validUpto}
                mode="date"
                display="default"
                onValueChange={onDateChange} onDismiss={() => onDateChange({type: "dismissed"})}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={validUpto}
                mode="time"
                display="default"
                onValueChange={onTimeChange} onDismiss={() => onTimeChange({type: "dismissed"})}
              />
            )}`
  );

  fs.writeFileSync(path, content);
}
