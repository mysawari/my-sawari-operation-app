import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import api from '../../../services/api';

export default function MembershipTrackerScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [sendingPush, setSendingPush] = useState(false);
  const [searchBookingQuery, setSearchBookingQuery] = useState('');

  const fetchTracker = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/memberships/${id}/tracker`);
      if (response.data?.success) {
        setData(response.data.data);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load membership details');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchTracker();
  }, [fetchTracker]);

  const handleSendNotification = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) {
      Alert.alert('Error', 'Title and message cannot be empty');
      return;
    }
    const customerId = data?.membership?.customerId?._id;
    if (!customerId) return;

    setSendingPush(true);
    try {
      await api.post('/notifications/send', {
        target: 'specific',
        customerId: [customerId],
        title: pushTitle,
        body: pushBody
      });
      Alert.alert('Success', 'Push notification sent to customer!');
      setModalVisible(false);
      setPushTitle('');
      setPushBody('');
    } catch (err) {
      Alert.alert('Error', 'Failed to send notification');
    } finally {
      setSendingPush(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!data || !data.membership) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#6B7280' }}>Membership not found</Text>
      </View>
    );
  }

  const { membership, history } = data;
  const customer = membership.customerId || {};
  const isActive = new Date(membership.expiresAt) > new Date();

  const filteredHistory = (history || []).filter(item => {
    if (!searchBookingQuery) return true;
    const q = searchBookingQuery.toLowerCase();
    const bCode = item.bookingCode?.toLowerCase() || '';
    const bId = item.bookingId?.toLowerCase() || '';
    return bCode.includes(q) || bId.includes(q);
  });

  const getStatusTimeline = (status) => {
    const s = status.toLowerCase();
    if (s === 'cancelled') return <Text style={{color: '#DC2626', fontWeight: 'bold'}}>CANCELLED</Text>;
    
    const isHandover = s === 'active' || s === 'completed';
    const isCompleted = s === 'completed';

    return (
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <Text style={{color: '#10B981', fontWeight: '600', fontSize: 11}}>Booked</Text>
        <Feather name="arrow-right" size={12} color="#9CA3AF" style={{marginHorizontal: 4}} />
        <Text style={{color: isHandover ? '#3B82F6' : '#D1D5DB', fontWeight: isHandover ? '600' : '400', fontSize: 11}}>Handover</Text>
        <Feather name="arrow-right" size={12} color="#9CA3AF" style={{marginHorizontal: 4}} />
        <Text style={{color: isCompleted ? '#059669' : '#D1D5DB', fontWeight: isCompleted ? '600' : '400', fontSize: 11}}>Complete</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Membership Details</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.pushBtn}>
          <Feather name="bell" size={20} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* CUSTOMER INFO CARD */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Customer Profile</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{customer.customerName || membership.customerName || 'Unknown'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Mobile</Text>
            <Text style={styles.value}>{customer.mobileNumber || 'N/A'}</Text>
          </View>
          {!!customer.email && (
            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{customer.email}</Text>
            </View>
          )}
        </View>

        {/* MEMBERSHIP INFO CARD */}
        <View style={styles.card}>
          <View style={[styles.row, { borderBottomWidth: 0, paddingBottom: 0, marginBottom: 12 }]}>
            <Text style={styles.sectionTitle}>Membership Plan</Text>
            <View style={[styles.statusBadge, !isActive && { backgroundColor: '#FEE2E2' }]}>
              <Text style={[styles.statusText, !isActive && { color: '#DC2626' }]}>
                {isActive ? 'ACTIVE' : 'EXPIRED'}
              </Text>
            </View>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Plan Tier</Text>
            <Text style={[styles.value, { textTransform: 'capitalize', fontWeight: 'bold' }]}>{membership.plan}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Valid Until</Text>
            <Text style={styles.value}>{new Date(membership.expiresAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Payment Method</Text>
            <Text style={[styles.value, { textTransform: 'capitalize' }]}>{membership.payment?.paymentMethod || 'N/A'}</Text>
          </View>
          {membership.payment?.upiLastFour && (
            <View style={styles.row}>
              <Text style={styles.label}>UPI Last 4</Text>
              <Text style={styles.value}>{membership.payment.upiLastFour}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Amount Paid</Text>
            <Text style={styles.value}>₹{membership.payment?.amount || 0}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Total Savings</Text>
            <Text style={[styles.value, { color: '#059669', fontWeight: '600' }]}>₹{membership.totalSaved || 0}</Text>
          </View>
        </View>

        {/* HISTORY LIST */}
        <View style={[styles.row, { borderBottomWidth: 0, paddingBottom: 0, marginBottom: 8, marginTop: 16 }]}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Membership Bookings</Text>
        </View>

        <TextInput 
          style={styles.historySearch}
          placeholder="Search by Booking ID..."
          value={searchBookingQuery}
          onChangeText={setSearchBookingQuery}
        />

        {filteredHistory.length > 0 ? (
          filteredHistory.map(item => (
            <View key={item._id} style={styles.historyCard}>
              <View style={styles.historyTop}>
                <Text style={styles.bookingId}>{item.bookingCode || item.bookingId || 'Unknown ID'}</Text>
                {getStatusTimeline(item.status)}
              </View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4}}>
                <Text style={styles.historyDate}>Pickup: {item.fromDate ? new Date(item.fromDate).toLocaleDateString() : 'N/A'}</Text>
                <Text style={styles.historyDate}>Drop: {item.toDate ? new Date(item.toDate).toLocaleDateString() : 'N/A'}</Text>
              </View>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4}}>
                <Text style={styles.historyAmount}>Total: ₹{item.payment?.totalAmount || item.totalAmount || 0}</Text>
                <View style={{backgroundColor: '#D1FAE5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4}}>
                  <Text style={{fontSize: 11, color: '#059669', fontWeight: '700'}}>Saved: ₹{item.membershipDiscount || 0}</Text>
                </View>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.noData}>No bookings found matching your search.</Text>
        )}

      </ScrollView>

      {/* SEND PUSH MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Send Push Notification</Text>
            <Text style={styles.modalDesc}>Send a direct message to {customer.customerName || 'this customer'}.</Text>

            <TextInput 
              style={styles.modalInput}
              placeholder="Title (e.g. Special Offer!)"
              value={pushTitle}
              onChangeText={setPushTitle}
            />
            <TextInput 
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Message body..."
              value={pushBody}
              onChangeText={setPushBody}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.sendBtn, sendingPush && { opacity: 0.7 }]} 
                onPress={handleSendNotification}
                disabled={sendingPush}
              >
                {sendingPush ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.sendBtnText}>Send Push</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  pushBtn: { padding: 8, backgroundColor: '#EEF2FF', borderRadius: 8 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  label: { fontSize: 14, color: '#6B7280' },
  value: { fontSize: 14, fontWeight: '600', color: '#111827' },

  statusBadge: { backgroundColor: '#DEF7EC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '700', color: '#03543F' },

  historySearch: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, marginBottom: 12 },
  historyCard: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bookingId: { fontSize: 14, fontWeight: '700', color: '#374151' },
  historyStatus: { fontSize: 12, fontWeight: '700' },
  historyDate: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  historyAmount: { fontSize: 14, fontWeight: '600', color: '#111827' },
  noData: { color: '#6B7280', fontStyle: 'italic', marginLeft: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  modalDesc: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  modalInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 8, backgroundColor: '#F3F4F6' },
  cancelBtnText: { color: '#374151', fontWeight: '600' },
  sendBtn: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 8, backgroundColor: '#4F46E5' },
  sendBtnText: { color: '#FFF', fontWeight: '600' }
});
