import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import api from '../../../services/api';
import axios from 'axios';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReferralsScreen() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReferrals = useCallback(async () => {
    try {
      const response = await api.get('/referrals');
      const data = response.data?.data || response.data || [];
      // Backend returns array of customers with withdrawalRequests
      const allWithdrawals = [];
      data.forEach(customer => {
        if (customer.withdrawalRequests && Array.isArray(customer.withdrawalRequests)) {
          customer.withdrawalRequests.forEach(req => {
            allWithdrawals.push({
              ...req,
              customerId: {
                _id: customer._id,
                customerName: customer.customerName,
                mobileNumber: customer.mobileNumber,
                walletBalance: customer.walletBalance
              }
            });
          });
        }
      });
      // Sort by newest first
      allWithdrawals.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
      setWithdrawals(allWithdrawals);
    } catch (error) {
      console.error(error?.message);
      Alert.alert('Error', 'Failed to load referral withdrawals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReferrals();
  }, [fetchReferrals]);

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

  const handleStatusUpdate = async (customerId, requestId, newStatus) => {
    Alert.alert(
      `${newStatus === 'released' ? 'Approve' : 'Reject'} Withdrawal`,
      `Are you sure you want to mark this withdrawal as ${newStatus}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Confirm", 
          style: newStatus === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await api.put(`/referrals/withdrawals/${customerId}/${requestId}/status`, { status: newStatus });
              Alert.alert('Success', `Withdrawal ${newStatus} successfully!`);
              
              if (newStatus === 'released') {
                notifyCustomer(customerId, 'Withdrawal Approved! 🎉', 'Your referral earnings withdrawal has been approved and processed.');
              } else {
                notifyCustomer(customerId, 'Withdrawal Rejected', 'Your recent withdrawal request could not be processed.');
              }
              fetchReferrals();
            } catch (error) {
              console.error(error?.message);
              Alert.alert('Error', 'Failed to update withdrawal status');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    const isPending = item.status === 'pending';
    const isApproved = item.status === 'released';
    const isRejected = item.status === 'rejected';
    
    // Fallback info if the API structure is slightly different
    const customer = item.customerId || {};
    const mobile = customer.mobileNumber || item.customerMobile || 'Unknown';
    const name = customer.customerName || 'Unknown Customer';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={[styles.avatar, { backgroundColor: '#E0E7FF' }]}>
              <Feather name="gift" size={18} color="#4338CA" />
            </View>
            <View>
              <Text style={styles.customerName}>{name}</Text>
              <Text style={styles.customerMobile}>{mobile}</Text>
            </View>
          </View>
          <View style={[
            styles.statusBadge, 
            isApproved ? styles.statusApproved : (isRejected ? styles.statusRejected : styles.statusPending)
          ]}>
            <Text style={[
              styles.statusText, 
              isApproved ? styles.statusApprovedText : (isRejected ? styles.statusRejectedText : styles.statusPendingText)
            ]}>
              {item.status?.toUpperCase() || 'PENDING'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Requested Amount</Text>
            <Text style={styles.amountText}>₹{(item.amount || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Request Date</Text>
            <Text style={styles.reasonText}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Today'}</Text>
          </View>
        </View>

        {isPending && (
          <View style={styles.actionsRow}>
             <TouchableOpacity 
              style={[styles.actionBtn, styles.approveBtn]} 
              activeOpacity={0.8}
              onPress={() => handleStatusUpdate(customer._id || item.customerId?._id || item.customerId, item._id, 'released')}
            >
              <Feather name="check" size={16} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.btnTextWhite}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, styles.rejectBtn]} 
              activeOpacity={0.8}
              onPress={() => handleStatusUpdate(customer._id || item.customerId?._id || item.customerId, item._id, 'rejected')}
            >
              <Feather name="x" size={16} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={styles.btnTextRed}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const router = useRouter();

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4338CA" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Referral Withdrawals</Text>
        <View style={styles.headerRight} />
      </View>
      <FlatList
        data={withdrawals}
        keyExtractor={(item, index) => item._id || String(index)}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4338CA']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="inbox" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Withdrawal Requests</Text>
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
    justifyContent: 'center', 
    alignItems: 'center',
    marginRight: 12
  },
  customerName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  customerMobile: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPending: { backgroundColor: '#FEF3C7' },
  statusApproved: { backgroundColor: '#D1FAE5' },
  statusRejected: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  statusPendingText: { color: '#D97706' },
  statusApprovedText: { color: '#059669' },
  statusRejectedText: { color: '#DC2626' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  detailItem: { flex: 1 },
  detailLabel: { fontSize: 12, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  amountText: { fontSize: 18, fontWeight: '700', color: '#111827' },
  reasonText: { fontSize: 14, color: '#374151' },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { 
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10, 
    borderRadius: 10, 
    alignItems: 'center', 
    justifyContent: 'center',
  },
  approveBtn: {
    backgroundColor: '#4338CA',
  },
  rejectBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  btnTextWhite: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  btnTextRed: { color: '#EF4444', fontWeight: '600', fontSize: 14 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 }
});
