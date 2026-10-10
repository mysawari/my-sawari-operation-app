import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, RefreshControl, TextInput } from 'react-native';
import api from '../../../services/api';
import axios from 'axios';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MembershipsScreen() {
  const [memberships, setMemberships] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMemberships = useCallback(async () => {
    try {
      const response = await api.get('/memberships');
      setMemberships(response.data?.data || response.data || []);
    } catch (error) {
      console.error(error?.message);
      Alert.alert('Error', 'Failed to load memberships');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMemberships();
  }, [fetchMemberships]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMemberships();
  }, [fetchMemberships]);

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

  const handleCancel = async (id, customerId) => {
    Alert.alert(
      "Cancel Membership",
      "Are you sure you want to cancel this membership? This cannot be undone.",
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/memberships/${id}`);
              Alert.alert('Success', 'Membership cancelled.');
              notifyCustomer(customerId, 'Membership Cancelled', 'Your MySawari membership has been cancelled.');
              fetchMemberships();
            } catch (error) {
              console.error(error?.message);
              Alert.alert('Error', 'Failed to cancel membership');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    const customer = item.customerId || {};
    const mobile = customer.mobileNumber || 'Unknown';
    const name = customer.customerName || 'Unknown Customer';

    const cap = item.plan === 'pro' ? 20000 : item.plan === 'plus' ? 15000 : 10000;
    const saved = item.totalSaved || 0;
    const progressPercent = Math.min((saved / cap) * 100, 100);

    return (
      <TouchableOpacity 
        style={styles.card} 
        activeOpacity={0.7} 
        onPress={() => router.push('/menu/memberships/' + item._id)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Feather name="star" size={18} color="#F59E0B" />
            </View>
            <View>
              <Text style={styles.customerName}>{name}</Text>
              <Text style={styles.customerMobile}>{mobile}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, new Date(item.expiresAt) < new Date() && { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.statusText, new Date(item.expiresAt) < new Date() && { color: '#DC2626' }]}>
              {new Date(item.expiresAt) < new Date() ? 'EXPIRED' : 'ACTIVE'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Plan</Text>
            <Text style={styles.amountText}>{item.plan ? item.plan.charAt(0).toUpperCase() + item.plan.slice(1) : 'Pro'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Valid Until</Text>
            <Text style={styles.reasonText}>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'Active'}</Text>
          </View>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabelText}>Saved: ₹{saved}</Text>
            <Text style={styles.progressLabelText}>Cap: ₹{cap}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>

        <TouchableOpacity 
          style={styles.cancelBtn} 
          activeOpacity={0.8}
          onPress={() => handleCancel(item._id, customer._id)}
        >
          <Feather name="x-circle" size={16} color="#EF4444" style={{ marginRight: 6 }} />
          <Text style={styles.btnText}>Revoke Membership</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const router = useRouter();

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F59E0B" />
      </View>
    );
  }

  const filteredMemberships = memberships.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const customer = item.customerId || {};
    const mobile = customer.mobileNumber || '';
    const name = (customer.customerName || '').toLowerCase();
    return name.includes(q) || mobile.includes(q);
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Memberships</Text>
        <TouchableOpacity onPress={() => router.push('/menu/memberships/create')} style={styles.headerRight}>
          <Feather name="plus" size={24} color="#111827" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.searchContainer}>
        <Feather name="search" size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or mobile..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Feather name="x" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredMemberships}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F59E0B']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="award" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Active Memberships</Text>
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
  listContainer: { padding: 12, paddingBottom: 40 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    margin: 12, marginBottom: 0, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB', height: 44
  },
  searchInput: { flex: 1, paddingHorizontal: 8, fontSize: 14 },
  card: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 12, 
    marginBottom: 12, 
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#F3F4F6'
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  avatar: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: '#FEF3C7', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginRight: 10
  },
  customerName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  customerMobile: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: '#D1FAE5' },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: '#059669' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 8 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  detailItem: { flex: 1 },
  detailLabel: { fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  amountText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  reasonText: { fontSize: 13, color: '#374151' },
  progressContainer: { marginBottom: 12 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressLabelText: { fontSize: 12, fontWeight: '600', color: '#059669' },
  progressBarBg: { height: 6, backgroundColor: '#D1FAE5', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#059669', borderRadius: 3 },
  cancelBtn: { 
    backgroundColor: '#FEF2F2', 
    flexDirection: 'row',
    paddingVertical: 8, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  btnText: { color: '#EF4444', fontWeight: '600', fontSize: 13 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 16 }
});
