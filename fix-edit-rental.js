const fs = require('fs');

const path = 'app/components/activeRental/edit-rental.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add newDropDate to useLocalSearchParams
content = content.replace(
  /pickupDateTime: navPickupDateTime,\s*}\s*=\s*useLocalSearchParams\(\);/,
  `pickupDateTime: navPickupDateTime,
    newDropDate,
  } = useLocalSearchParams();`
);

// 2. Add newDropDate usage in fetchRentalDetails
content = content.replace(
  /setPickupDate\(new Date\(data\.pickupDateTime\)\);\s*setOriginalDropDateTime\(new Date\(data\.dropDateTime\)\);\s*setDropDateTime\(new Date\(data\.dropDateTime\)\);/,
  `setPickupDate(new Date(data.pickupDateTime));
      setOriginalDropDateTime(new Date(data.dropDateTime));
      if (newDropDate && isValidDate(newDropDate)) {
        setDropDateTime(new Date(newDropDate));
      } else {
        setDropDateTime(new Date(data.dropDateTime));
      }`
);

fs.writeFileSync(path, content);
