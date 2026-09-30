const fs = require('fs');

const path = 'app/menu/lead/lead-management.jsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('appLeads')) {
  // Add state
  content = content.replace(
    /const \[leads, setLeads\] = useState\(\[\]\);/,
    `const [leads, setLeads] = useState([]);
  const [appLeads, setAppLeads] = useState([]);`
  );

  // Add tab
  content = content.replace(
    /\{ id: "all", label: "All Leads", icon: "list" \},/,
    `{ id: "all", label: "All Leads", icon: "list" },
    { id: "app", label: "App Leads", icon: "phone-portrait-outline" },`
  );

  // Add fetchLeads logic
  content = content.replace(
    /const fetchLeads = async \(\) => \{\s*try \{\s*const response = await api\.get\("\/leads"\);\s*if \(response\.data\?\.success\) \{\s*setLeads\(response\.data\.data\);\s*\}\s*\} catch \(err\) \{/,
    `const fetchLeads = async () => {
    try {
      const [leadsRes, appLeadsRes] = await Promise.all([
        api.get("/leads"),
        api.get("/leads/app-leads")
      ]);

      if (leadsRes.data?.success) {
        setLeads(leadsRes.data.data);
      }

      if (appLeadsRes.data?.success) {
        const transformedAppLeads = appLeadsRes.data.data.map(al => {
          let remarks = "App User";
          if (al.visitedPaths && al.visitedPaths.length > 0) {
            remarks += " | Visited: " + al.visitedPaths.join(", ");
          }
          if (al.vehicleSearches && al.vehicleSearches.length > 0) {
            remarks += " | Searched: " + al.vehicleSearches.map(v => v.type).join(", ");
          }

          return {
            _id: al._id,
            customerName: al.customerId?.name || 'App Customer',
            mobileNumber: al.mobile,
            status: "New",
            remarks: remarks,
            createdAt: al.createdAt,
            followUpDate: null,
            vehiclePreference: al.vehicleSearches?.[0]?.type || "Any",
            isAppLead: true
          };
        });
        setAppLeads(transformedAppLeads);
      }
    } catch (err) {`
  );

  // Update tabs render
  content = content.replace(
    /const renderList = \(\) => \{\s*switch \(activeTab\) \{\s*case "all":\s*return renderTabList\(sortedLeads\);\s*case "followup":\s*return renderTabList\(followUps\);\s*case "new":\s*return renderTabList\(newLeads\);\s*default:\s*return null;\s*\}\s*\};/,
    `const renderList = () => {
      switch (activeTab) {
        case "all":
          return renderTabList(sortedLeads);
        case "app":
          return renderTabList(appLeads);
        case "followup":
          return renderTabList(followUps);
        case "new":
          return renderTabList(newLeads);
        default:
          return null;
      }
    };`
  );

  fs.writeFileSync(path, content);
}
