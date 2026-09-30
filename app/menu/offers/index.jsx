import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, RefreshControl, Image, Modal, TextInput, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../../../services/api';
import { Stack, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function OffersScreen() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);

  // New Offer Form State
  const [offerType, setOfferType] = useState('coupon'); // 'coupon' | 'special_deal'
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [minimumBooking, setMinimumBooking] = useState('');
  const [maximumDiscount, setMaximumDiscount] = useState('');
  
  // Special Deal State
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');
  
  const filteredVehicles = vehicles.filter(v => 
    v.vehicleName?.toLowerCase().includes(vehicleSearchQuery.toLowerCase()) || 
    v.vehicleNumber?.toLowerCase().includes(vehicleSearchQuery.toLowerCase())
  );

  const [originalPrice, setOriginalPrice] = useState('');
  const [dealPrice, setDealPrice] = useState('');

  const [expiryDate, setExpiryDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [imageUri, setImageUri] = useState(null);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  };

  const fetchOffers = useCallback(async () => {
    try {
      const response = await api.get('/offers');
      setOffers(response.data?.data || response.data || []);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to load offers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchVehicles = useCallback(async () => {
    try {
      const response = await api.get('/vehicles/available');
      const v = response.data?.data || response.data || [];
      setVehicles(v);
    } catch (error) {
      console.warn('Failed to load vehicles', error);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
    fetchVehicles();
  }, [fetchOffers, fetchVehicles]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOffers();
    fetchVehicles();
  }, [fetchOffers, fetchVehicles]);

  const notifyAllCustomers = async (title, body) => {
    try {
      await api.post('/notifications/send', {
        title, body, target: 'all'
      });
      Alert.alert('Success', 'Push notification sent to all customers!');
    } catch (err) {
      console.warn("Failed to broadcast notification", err);
      Alert.alert('Error', 'Failed to broadcast notification via backend.');
    }
  };

  const handleCreateOffer = async () => {
    if (!title) {
      Alert.alert('Error', 'Title is required.');
      return;
    }
    if (offerType === 'coupon' && (!code || !discountValue)) {
      Alert.alert('Error', 'Code and Discount Value are required for coupons.');
      return;
    }
    if (offerType === 'special_deal') {
      if (!selectedVehicleId || !originalPrice || !dealPrice) {
        Alert.alert('Error', 'Vehicle, Original Price, and Deal Price are required for special deals.');
        return;
      }
      if (parseFloat(dealPrice) >= parseFloat(originalPrice)) {
        Alert.alert('Error', 'Deal Price must be less than Original Price.');
        return;
      }
    }
    
    setCreating(true);
    try {
      const formData = new FormData();
      formData.append('type', offerType);
      formData.append('title', title);
      formData.append('subtitle', subtitle);
      formData.append('expiryDate', expiryDate.toISOString());
      formData.append('active', 'true');

      if (offerType === 'coupon') {
        formData.append('code', code);
        formData.append('discountType', discountType);
        formData.append('discountValue', discountValue);
        if (minimumBooking) formData.append('minimumBooking', minimumBooking);
        if (discountType === 'PERCENTAGE' && maximumDiscount) formData.append('maximumDiscount', maximumDiscount);
      } else {
        formData.append('vehicleId', selectedVehicleId);
        formData.append('originalPrice', originalPrice);
        formData.append('dealPrice', dealPrice);
        const orig = parseFloat(originalPrice);
        const deal = parseFloat(dealPrice);
        if (orig > 0 && deal > 0) {
          const discountPct = Math.round(((orig - deal) / orig) * 100);
          formData.append('discountPercent', discountPct);
        }
      }

      if (imageUri) {
        const localUri = imageUri;
        const filename = localUri.split('/').pop() || 'offer.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;
        formData.append('image', { uri: localUri, name: filename, type });
      }

      await api.post('/offers', formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
        }
      });
      
      Alert.alert('Success', 'Offer created successfully! (A push notification was automatically sent to all customers).');
      setModalVisible(false);
      setTitle(''); setSubtitle(''); setCode(''); setDiscountValue(''); 
      setMinimumBooking(''); setMaximumDiscount(''); setImageUri(null);
      setOriginalPrice(''); setDealPrice('');
      fetchOffers();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to create offer');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    Alert.alert(
      "Delete Offer",
      "Are you sure you want to delete this offer?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/offers/${id}`);
              Alert.alert('Success', 'Offer deleted successfully!');
              fetchOffers();
            } catch (error) {
              console.error(error);
              Alert.alert('Error', 'Failed to delete offer');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    return (
      <View style={styles.card}>
        {item.image?.url && (
          <Image source={{ uri: item.image.url }} style={styles.offerImage} resizeMode="cover" />
        )}
        <View style={styles.cardContent}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{item.title || 'Special Offer'}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.type === 'special_deal' ? 'Special Deal' : `${item.discountValue || 0}% OFF`}</Text>
            </View>
          </View>
          
          <Text style={styles.description} numberOfLines={2}>{item.subtitle || (item.type === 'special_deal' ? 'Book this vehicle at a discounted price.' : 'Use this code to get a discount.')}</Text>
          
          <View style={styles.detailsRow}>
            {item.type === 'special_deal' ? (
              <View style={styles.detailItem}>
                <Feather name="tag" size={14} color="#6B7280" />
                <Text style={styles.detailText}>₹{item.dealPrice} <Text style={{textDecorationLine: 'line-through'}}>₹{item.originalPrice}</Text></Text>
              </View>
            ) : (
              <View style={styles.detailItem}>
                <Feather name="tag" size={14} color="#6B7280" />
                <Text style={styles.detailText}>Code: {item.code || 'N/A'}</Text>
              </View>
            )}
            <View style={styles.detailItem}>
              <Feather name="calendar" size={14} color="#6B7280" />
              <Text style={styles.detailText}>
                {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'No expiry'}
              </Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
             <TouchableOpacity 
              style={[styles.actionBtn, styles.notifyBtn]} 
              activeOpacity={0.8}
              onPress={() => notifyAllCustomers('New Offer! 🏷️', item.type === 'special_deal' ? `Special Deal available: ${item.title}` : `Use code ${item.code} to get ${item.discountValue}% off: ${item.title}`)}
            >
              <MaterialCommunityIcons name="broadcast" size={18} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.btnTextWhite}>Re-Broadcast</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, styles.deleteBtn]} 
              activeOpacity={0.8}
              onPress={() => handleDelete(item._id)}
            >
              <Feather name="trash-2" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const router = useRouter();

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0EA5E9" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Offers</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.headerRight}>
          <Feather name="plus-circle" size={24} color="#0EA5E9" />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={offers}
        keyExtractor={(item, index) => item._id || String(index)}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0EA5E9']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="brightness-percent" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No Offers Found</Text>
          </View>
        }
        renderItem={renderItem}
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Offer</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.label}>Offer Type</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity style={[styles.radio, offerType === 'coupon' && styles.radioActive]} onPress={() => setOfferType('coupon')}>
                  <Text style={[styles.radioText, offerType === 'coupon' && styles.radioTextActive]}>Coupon Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.radio, offerType === 'special_deal' && styles.radioActive]} onPress={() => setOfferType('special_deal')}>
                  <Text style={[styles.radioText, offerType === 'special_deal' && styles.radioTextActive]}>Special Deal</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Offer Title</Text>
              <TextInput style={styles.input} placeholder="e.g. Summer Sale" value={title} onChangeText={setTitle} />
              
              <Text style={styles.label}>Subtitle (Optional)</Text>
              <TextInput style={styles.input} placeholder="e.g. Get 20% off all rides" value={subtitle} onChangeText={setSubtitle} />
              
              {offerType === 'coupon' ? (
                <>
                  <Text style={styles.label}>Promo Code</Text>
                  <TextInput style={styles.input} placeholder="e.g. SUMMER20" value={code} onChangeText={setCode} autoCapitalize="characters" />
                  
                  <Text style={styles.label}>Discount Type</Text>
                  <View style={styles.radioGroup}>
                    <TouchableOpacity style={[styles.radio, discountType === 'PERCENTAGE' && styles.radioActive]} onPress={() => setDiscountType('PERCENTAGE')}>
                      <Text style={[styles.radioText, discountType === 'PERCENTAGE' && styles.radioTextActive]}>Percentage</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.radio, discountType === 'FLAT' && styles.radioActive]} onPress={() => setDiscountType('FLAT')}>
                      <Text style={[styles.radioText, discountType === 'FLAT' && styles.radioTextActive]}>Flat Amount</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.label}>{discountType === 'PERCENTAGE' ? 'Discount Percentage (%)' : 'Discount Amount (₹)'}</Text>
                  <TextInput style={styles.input} placeholder={discountType === 'PERCENTAGE' ? "e.g. 20" : "e.g. 500"} value={discountValue} onChangeText={setDiscountValue} keyboardType="numeric" />
                  
                  <Text style={styles.label}>Minimum Booking Amount (₹) (Optional)</Text>
                  <TextInput style={styles.input} placeholder="e.g. 2000" value={minimumBooking} onChangeText={setMinimumBooking} keyboardType="numeric" />
                  
                  {discountType === 'PERCENTAGE' && (
                    <>
                      <Text style={styles.label}>Maximum Discount (₹) (Optional)</Text>
                      <TextInput style={styles.input} placeholder="e.g. 1000" value={maximumDiscount} onChangeText={setMaximumDiscount} keyboardType="numeric" />
                    </>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.label}>Select Vehicle</Text>
                  <View style={styles.customPickerContainer}>
                    <TouchableOpacity 
                      style={styles.customPickerHeader} 
                      onPress={() => setShowVehiclePicker(!showVehiclePicker)}
                    >
                      <Text style={{ color: selectedVehicleId ? '#111827' : '#9CA3AF', fontSize: 15 }}>
                        {selectedVehicleId 
                          ? `${vehicles.find(v => v._id === selectedVehicleId)?.vehicleName} (${vehicles.find(v => v._id === selectedVehicleId)?.vehicleNumber})`
                          : "Select a vehicle..."}
                      </Text>
                      <Feather name={showVehiclePicker ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
                    </TouchableOpacity>

                    {showVehiclePicker && (
                      <View style={styles.customPickerDropdown}>
                        <TextInput
                          style={styles.customPickerSearch}
                          placeholder="Search car or bike name..."
                          value={vehicleSearchQuery}
                          onChangeText={setVehicleSearchQuery}
                        />
                        <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                          {filteredVehicles.map(v => (
                            <TouchableOpacity 
                              key={v._id} 
                              style={styles.customPickerItem}
                              onPress={() => {
                                setSelectedVehicleId(v._id);
                                setShowVehiclePicker(false);
                                setVehicleSearchQuery('');
                              }}
                            >
                              <Text style={styles.customPickerItemText}>
                                {v.vehicleName} <Text style={{ color: '#6B7280', fontSize: 13 }}>({v.vehicleNumber})</Text>
                              </Text>
                            </TouchableOpacity>
                          ))}
                          {filteredVehicles.length === 0 && (
                            <Text style={{ padding: 12, color: '#6B7280', textAlign: 'center' }}>No vehicles found</Text>
                          )}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <Text style={styles.label}>Original Price (₹)</Text>
                  <TextInput style={styles.input} placeholder="e.g. 3000" value={originalPrice} onChangeText={setOriginalPrice} keyboardType="numeric" />

                  <Text style={styles.label}>Deal Price (₹)</Text>
                  <TextInput style={styles.input} placeholder="e.g. 2500" value={dealPrice} onChangeText={setDealPrice} keyboardType="numeric" />
                </>
              )}
              
              <Text style={styles.label}>Valid Upto Date & Time</Text>
              <View style={styles.datePickerRow}>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                  <Feather name="calendar" size={16} color="#4B5563" />
                  <Text style={styles.dateBtnText}>{expiryDate.toLocaleDateString()}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
                  <Feather name="clock" size={16} color="#4B5563" />
                  <Text style={styles.dateBtnText}>
                    {expiryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={expiryDate}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onValueChange={(event, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) {
                      const newDate = new Date(expiryDate);
                      newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                      setExpiryDate(newDate);
                    }
                  }}
                  onDismiss={() => setShowDatePicker(false)}
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={expiryDate}
                  mode="time"
                  display="default"
                  onValueChange={(event, selectedDate) => {
                    setShowTimePicker(false);
                    if (selectedDate) {
                      const newDate = new Date(expiryDate);
                      newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
                      setExpiryDate(newDate);
                    }
                  }}
                  onDismiss={() => setShowTimePicker(false)}
                />
              )}

              <Text style={styles.label}>Offer Banner Image (16:9)</Text>
              <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImage}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
                ) : (
                  <View style={styles.imagePickerPlaceholder}>
                    <Feather name="image" size={24} color="#9CA3AF" />
                    <Text style={styles.imagePickerText}>Select an image...</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.submitBtn} onPress={handleCreateOffer} disabled={creating}>
                {creating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTextWhite}>Create Offer & Notify</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  headerRight: { padding: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  listContainer: { padding: 16, paddingBottom: 40 },
  card: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 16, 
    marginBottom: 16, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    overflow: 'hidden'
  },
  offerImage: { width: '100%', height: 140, backgroundColor: '#E0F2FE' },
  cardContent: { padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 },
  badge: { backgroundColor: '#E0F2FE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#0284C7', fontWeight: '800', fontSize: 12 },
  description: { fontSize: 14, color: '#4B5563', marginBottom: 16, lineHeight: 20 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  detailItem: { flexDirection: 'row', alignItems: 'center' },
  detailText: { fontSize: 13, color: '#6B7280', marginLeft: 6, fontWeight: '500' },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { 
    flexDirection: 'row',
    paddingVertical: 12, 
    borderRadius: 10, 
    alignItems: 'center', 
    justifyContent: 'center',
  },
  notifyBtn: {
    backgroundColor: '#0EA5E9',
    flex: 1,
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 20,
  },
  btnTextWhite: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  radioGroup: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  radio: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, alignItems: 'center', backgroundColor: '#F9FAFB' },
  radioActive: { borderColor: '#0EA5E9', backgroundColor: '#E0F2FE' },
  radioText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  radioTextActive: { color: '#0EA5E9' },
  imagePickerBtn: { marginTop: 4, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  imagePreview: { width: '100%', aspectRatio: 16/9, backgroundColor: '#E0F2FE' },
  imagePickerPlaceholder: { width: '100%', aspectRatio: 16/9, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  imagePickerText: { marginTop: 8, color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  submitBtn: { backgroundColor: '#0EA5E9', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 24, marginBottom: 40 },
  datePickerRow: { flexDirection: 'row', gap: 12 },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  dateBtnText: { marginLeft: 8, fontSize: 15, color: '#111827' },
  pickerContainer: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, backgroundColor: '#FFF' },
  customPickerContainer: {
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    borderRadius: 10, 
    backgroundColor: '#F9FAFB',
    overflow: 'hidden'
  },
  customPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  customPickerDropdown: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFF'
  },
  customPickerSearch: {
    margin: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827'
  },
  customPickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6'
  },
  customPickerItemText: {
    fontSize: 15,
    color: '#111827'
  }
});
