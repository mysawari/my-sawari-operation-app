const fs = require('fs');

const path = 'app/screens/NewBooking.jsx';
let content = fs.readFileSync(path, 'utf8');

// Check if already applied
if (!content.includes('verifyMembership')) {
  // Add state
  content = content.replace(
    /const \[discountAmount, setDiscountAmount\] = useState\(""\);/,
    `const [discountAmount, setDiscountAmount] = useState("");
  const [hasMembership, setHasMembership] = useState(false);
  const [membershipTier, setMembershipTier] = useState(null);`
  );

  // Add verify logic
  content = content.replace(
    /const renderSelectedVehicleDetail = \(\) => \{/,
    `const verifyMembership = async (mobile) => {
    if (!mobile || mobile.length < 10) return;
    try {
      const res = await api.get(\`/memberships/check/\${mobile}\`);
      if (res.data?.success && res.data?.data) {
        setHasMembership(true);
        setMembershipTier(res.data.data.plan);
        Alert.alert("Membership Found", \`This customer has an active \${res.data.data.plan.toUpperCase()} membership!\`);
        
        if (!discountAmount || discountAmount === "0") {
          const discountPct = res.data.data.plan === 'pro' ? 0.20 : res.data.data.plan === 'plus' ? 0.10 : 0.05;
          const fare = toNum(totalFare);
          if (fare > 0) {
            setDiscountAmount(String(Math.floor(fare * discountPct)));
          }
        }
      } else {
        setHasMembership(false);
        setMembershipTier(null);
      }
    } catch (err) {
      setHasMembership(false);
      setMembershipTier(null);
    }
  };

  useEffect(() => {
    if (contactNumber && contactNumber.length === 10) {
      verifyMembership(contactNumber);
    }
  }, [contactNumber, totalFare]);

  const renderSelectedVehicleDetail = () => {`
  );

  // Update DateTimePickers
  content = content.replace(
    /onChange=\{onDateChange\}/g,
    'onValueChange={onDateChange} onDismiss={() => onDateChange({type: "dismissed"})}'
  );

  fs.writeFileSync(path, content);
}
