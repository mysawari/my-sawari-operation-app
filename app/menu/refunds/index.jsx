import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, RefreshControl, TextInput, ScrollView } from 'react-native';
import api from '../../../services/api';
import axios from 'axios';
import { Stack, useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RefundsScreen() {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('All');

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
              <Feather name="user" size={14} color="#4F46E5" />
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
              <Feather name="x-circle" size={14} color="#EF4444" style={{ marginRight: 4 }} />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, styles.approveBtn]} 
              activeOpacity={0.8}
              onPress={() => updateStatus(item._id, item.customerId?._id, 'approved')}
            >
              <Feather name="check-circle" size={14} color="#FFF" style={{ marginRight: 4 }} />
              <Text style={styles.btnText}>Approve</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {isApproved && (
          <View style={styles.processedFooter}>
            <Feather name="check" size={12} color="#10B981" />
            <Text style={styles.approvedText}>
              Processed by: {item.processedBy?.fullName || 'Admin'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const router = useRouter();

  const filteredRefunds = refunds.filter(item => {
    // Tab filter
    if (activeTab !== 'All' && item.status !== activeTab.toLowerCase()) {
      return false;
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const customerName = (item.customerId?.customerName || '').toLowerCase();
      const customerMobile = (item.customerMobile || item.customerId?.mobileNumber || '').toLowerCase();
      const reason = (item.reason || '').toLowerCase();
      
      if (!customerName.includes(q) && !customerMobile.includes(q) && !reason.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const TABS = ['All', 'Pending', 'Approved', 'Rejected'];

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

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, mobile or reason..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, activeTab === tab && styles.activeTabButton]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredRefunds}
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
    borderRadius: 12, 
    marginBottom: 12, 
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6'
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  avatar: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: '#EEF2FF', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginRight: 10
  },
  customerName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  customerMobile: { fontSize: 12, color: '#6B7280' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  statusPending: { backgroundColor: '#FEF3C7' },
  statusApproved: { backgroundColor: '#D1FAE5' },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statusPendingText: { color: '#D97706' },
  statusApprovedText: { color: '#059669' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 8 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  detailItem: { flex: 1 },
  detailLabel: { fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  amountText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  reasonText: { fontSize: 12, color: '#374151', paddingRight: 8 },
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8 },
  approveBtn: { backgroundColor: '#10B981' },
  rejectBtn: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' },
  rejectBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 12 },
  btnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  processedFooter: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F9FAFB', 
    padding: 8, 
    borderRadius: 6, 
    marginTop: 4 
  },
  approvedText: { color: '#10B981', fontWeight: '500', fontSize: 11, marginLeft: 4 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', marginTop: 8 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, fontSize: 13, color: '#111827', paddingVertical: 0 },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  tabsScroll: {
    paddingHorizontal: 16,
  },
  tabButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomColor: '#4F46E5',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#4F46E5',
  }
});
