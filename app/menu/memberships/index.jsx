import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import api from '../../../services/api';
import axios from 'axios';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MembershipsScreen() {
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMemberships = useCallback(async () => {
    try {
      const response = await api.get('/memberships');
      setMemberships(response.data?.data || response.data || []);
    } catch (error) {
      console.error(error);
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
      console.warn("Failed to send notification", err);
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
              console.error(error);
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

    return (
      <View style={styles.card}>
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
            <Text style={styles.reasonText}>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'Lifetime / Active'}</Text>
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
      </View>
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Memberships</Text>
        <View style={styles.headerRight} />
      </View>
      <FlatList
        data={memberships}
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
    backgroundColor: '#FEF3C7', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginRight: 12
  },
  customerName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  customerMobile: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#D1FAE5' },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: '#059669' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  detailItem: { flex: 1 },
  detailLabel: { fontSize: 12, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  amountText: { fontSize: 16, fontWeight: '700', color: '#111827' },
  reasonText: { fontSize: 14, color: '#374151' },
  cancelBtn: { 
    backgroundColor: '#FEF2F2', 
    flexDirection: 'row',
    paddingVertical: 10, 
    borderRadius: 10, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  btnText: { color: '#EF4444', fontWeight: '600', fontSize: 14 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 }
});
