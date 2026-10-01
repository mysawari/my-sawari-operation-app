import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import api from '../../../services/api';
import axios from 'axios';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RefundsScreen() {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRefunds = useCallback(async () => {
    try {
      const response = await api.get('/refunds');
      setRefunds(response.data);
    } catch (error) {
      console.error(error?.message);
      Alert.alert('Error', 'Failed to load refunds');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRefunds();
  }, [fetchRefunds]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRefunds();
  }, [fetchRefunds]);

  const notifyCustomer = async (customerId, title, body) => {
    if (!customerId) return;
    try {
      await api.post('/notifications/send', {
        target: 'specific', customerId: [customerId], title, body
      });
    } catch (err) {
      console.warn("Failed to send notification", err?.message);
    }
  };

  const updateStatus = async (id, customerId, status) => {
    const actionText = status === 'approved' ? 'approve' : 'reject';
    const actionTitle = status === 'approved' ? 'Approve' : 'Reject';
    Alert.alert(
      `${actionTitle} Refund`,
      `Are you sure you want to ${actionText} this refund?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: actionTitle, 
          style: status === 'approved' ? "default" : "destructive",
          onPress: async () => {
            try {
              await api.put(`/refunds/${id}`, { status });
              Alert.alert('Success', `Refund ${status} successfully!`);
              
              if (status === 'approved') {
                notifyCustomer(customerId, "Refund Approved! 💸", "Your refund request has been approved and processed.");
              } else {
                notifyCustomer(customerId, "Refund Rejected", "Your refund request could not be processed. Please contact support.");
              }

              fetchRefunds();
            } catch (error) {
              console.error(error?.message);
              Alert.alert('Error', `Failed to ${actionText} refund`);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    const isPending = item.status === 'pending';
    const isApproved = item.status === 'approved';
    const customerMobile = item.customerMobile || item.customerId?.mobileNumber || 'Unknown';
    const customerName = item.customerId?.customerName || 'Unknown Customer';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Feather name="user" size={18} color="#4F46E5" />
            </View>
            <View>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.customerMobile}>{customerMobile}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, isApproved ? styles.statusApproved : styles.statusPending]}>
            <Text style={[styles.statusText, isApproved ? styles.statusApprovedText : styles.statusPendingText]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Amount</Text>
            <Text style={styles.amountText}>₹{(item.amount || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Reason</Text>
            <Text style={styles.reasonText} numberOfLines={2}>{item.reason || 'No reason provided'}</Text>
          </View>
        </View>

        {isPending && (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity 
              style={[styles.actionBtn, styles.rejectBtn]} 
              activeOpacity={0.8}
              onPress={() => updateStatus(item._id, item.customerId?._id, 'rejected')}
            >
              <Feather name="x-circle" size={18} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, styles.approveBtn]} 
              activeOpacity={0.8}
              onPress={() => updateStatus(item._id, item.customerId?._id, 'approved')}
            >
              <Feather name="check-circle" size={18} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.btnText}>Approve</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {isApproved && (
          <View style={styles.processedFooter}>
            <Feather name="check" size={14} color="#10B981" />
            <Text style={styles.approvedText}>
              Processed by: {item.processedBy?.fullName || 'Admin'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const router = useRouter();

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Refund Requests</Text>
        <View style={styles.headerRight} />
      </View>
      <FlatList
        data={refunds}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="inbox" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Refund Requests</Text>
            <Text style={styles.emptySubtitle}>You're all caught up!</Text>
          </View>
        }
        renderItem={renderItem}
      />
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  listContainer: { padding: 16, paddingBottom: 40 },
  card: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 16, 
    marginBottom: 16, 
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6'
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  avatar: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: '#EEF2FF', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginRight: 12
  },
  customerName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  customerMobile: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPending: { backgroundColor: '#FEF3C7' },
  statusApproved: { backgroundColor: '#D1FAE5' },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  statusPendingText: { color: '#D97706' },
  statusApprovedText: { color: '#059669' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  detailItem: { flex: 1 },
  detailLabel: { fontSize: 12, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  amountText: { fontSize: 18, fontWeight: '700', color: '#111827' },
  reasonText: { fontSize: 14, color: '#374151', paddingRight: 8 },
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
  approveBtn: { backgroundColor: '#10B981' },
  rejectBtn: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' },
  rejectBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  btnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  processedFooter: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F9FAFB', 
    padding: 10, 
    borderRadius: 8, 
    marginTop: 4 
  },
  approvedText: { color: '#10B981', fontWeight: '500', fontSize: 13, marginLeft: 6 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', marginTop: 8 }
});
