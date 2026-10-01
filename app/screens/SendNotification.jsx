import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import api from '../../services/api';
import { Stack, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SendNotificationScreen() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mobile, setMobile] = useState('');
  const [type, setType] = useState('broadcast'); // 'broadcast' | 'specific'
  const [loading, setLoading] = useState(false);
  
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  
  React.useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await api.get('/notifications/customers');
        if (res.data?.data) {
          setCustomers(res.data.data);
        }
      } catch (err) {
        console.warn('Failed to fetch customers', err?.message);
      }
    };
    fetchCustomers();
  }, []);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Error', 'Title and body are required.');
      return;
    }
    
    if (type === 'specific' && !mobile.trim()) {
      Alert.alert('Error', 'Mobile number is required for specific customer.');
      return;
    }

    setLoading(true);
    try {
      let customerId = null;
      if (type === 'specific') {
        // Fetch customers to find the ID matching the mobile number
        const custRes = await api.get('/notifications/customers');
        const customers = custRes.data?.data || [];
        const found = customers.find(c => c.mobileNumber === mobile.trim());
        if (!found) {
          Alert.alert('Error', 'Customer not found with this mobile number.');
          setLoading(false);
          return;
        }
        customerId = found._id;
      }

      await api.post('/notifications/send', {
        title: title.trim(),
        body: body.trim(),
        target: type === 'broadcast' ? 'all' : 'specific',
        customerId: customerId
      });
      
      Alert.alert('Success', 'Notification sent successfully!');
      setTitle('');
      setBody('');
      setMobile('');
    } catch (err) {
      console.warn("Failed to send notification", err?.message);
      Alert.alert('Error', 'Failed to send notification via backend.');
    } finally {
      setLoading(false);
    }
  };

  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send Notification</Text>
        <View style={styles.headerRight} />
      </View>
      
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          
          <View style={styles.tabsContainer}>
            <TouchableOpacity 
              style={[styles.tab, type === 'broadcast' && styles.activeTab]}
              onPress={() => setType('broadcast')}
            >
              <MaterialCommunityIcons name="broadcast" size={20} color={type === 'broadcast' ? '#FFF' : '#6B7280'} />
              <Text style={[styles.tabText, type === 'broadcast' && styles.activeTabText]}>Broadcast</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.tab, type === 'specific' && styles.activeTab]}
              onPress={() => setType('specific')}
            >
              <Feather name="user" size={18} color={type === 'specific' ? '#FFF' : '#6B7280'} />
              <Text style={[styles.tabText, type === 'specific' && styles.activeTabText]}>Specific User</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>
              {type === 'broadcast' ? 'Broadcast to All Users' : 'Send to Specific User'}
            </Text>
            <Text style={styles.formSubtitle}>
              {type === 'broadcast' 
                ? 'This will send a push notification to every registered customer device.' 
                : 'Enter the exact 10-digit mobile number of the customer.'}
            </Text>

            {type === 'specific' && (
              <View style={[styles.inputGroup, { zIndex: 10 }]}>
                <Text style={styles.label}>Search Customer by Mobile or Name</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput 
                    style={styles.input}
                    placeholder="e.g. 9876543210 or John"
                    value={searchQuery}
                    onFocus={() => setShowDropdown(true)}
                    onChangeText={(txt) => {
                      setSearchQuery(txt);
                      setShowDropdown(true);
                      setMobile(txt); // fallback to manual typing
                    }}
                  />
                  {showDropdown && (
                    <View style={styles.dropdown}>
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }}>
                        {customers
                          .filter(c => 
                            c.mobileNumber?.includes(searchQuery) || 
                            c.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
                          )
                          .map((c, i) => (
                            <TouchableOpacity 
                              key={i} 
                              style={styles.dropdownItem}
                              onPress={() => {
                                setMobile(c.mobileNumber);
                                setSearchQuery(`${c.customerName} - ${c.mobileNumber}`);
                                setShowDropdown(false);
                              }}
                            >
                              <Text style={styles.dropdownItemText}>{c.customerName} ({c.mobileNumber})</Text>
                            </TouchableOpacity>
                          ))}
                        {customers.filter(c => 
                          c.mobileNumber?.includes(searchQuery) || 
                          c.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
                        ).length === 0 && (
                          <Text style={styles.noMatch}>No match found</Text>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Notification Title</Text>
              <TextInput 
                style={styles.input}
                placeholder="e.g. Holiday Special Offer! 🚀"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Message Body</Text>
              <TextInput 
                style={[styles.input, styles.textArea]}
                placeholder="Type your message here..."
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={body}
                onChangeText={setBody}
              />
            </View>

            <TouchableOpacity 
              style={[styles.sendBtn, loading && styles.disabledBtn]} 
              onPress={handleSend}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Feather name="send" size={18} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.btnTextWhite}>Send Notification</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerRight: { padding: 4, width: 32 },
  scrollContainer: { padding: 16, paddingBottom: 40 },
  tabsContainer: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4, marginBottom: 24 },
  tab: { flex: 1, flexDirection: 'row', paddingVertical: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#4F46E5', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  tabText: { marginLeft: 8, fontSize: 14, fontWeight: '600', color: '#6B7280' },
  activeTabText: { color: '#FFFFFF' },
  formCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#F3F4F6' },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  formSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 24, lineHeight: 18 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  textArea: { minHeight: 100 },
  sendBtn: { backgroundColor: '#4F46E5', flexDirection: 'row', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  disabledBtn: { opacity: 0.7 },
  btnTextWhite: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  dropdown: { position: 'absolute', top: 52, left: 0, right: 0, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, zIndex: 100 },
  dropdownItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dropdownItemText: { fontSize: 14, color: '#374151' },
  noMatch: { padding: 12, fontSize: 14, color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center' }
});
