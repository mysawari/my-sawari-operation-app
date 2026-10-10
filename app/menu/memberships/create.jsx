import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import api from '../../../services/api';
import { Stack, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CreateMembershipScreen() {
  const [mobileNumber, setMobileNumber] = useState('');
  const [plan, setPlan] = useState('starter');
  const [amount, setAmount] = useState('999');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();

  const handlePlanChange = (selectedPlan) => {
    setPlan(selectedPlan);
    if (selectedPlan === 'starter') setAmount('999');
    if (selectedPlan === 'plus') setAmount('1999');
    if (selectedPlan === 'pro') setAmount('2999');
  };

  const handleCreate = async () => {
    if (!mobileNumber.trim() || mobileNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/memberships', {
        mobileNumber: mobileNumber.trim(),
        plan,
        amount,
        paymentMethod
      });
      
      Alert.alert('Success', 'Membership added successfully!');
      router.back();
    } catch (err) {
      console.warn("Failed to add membership", err?.message);
      const msg = err.response?.data?.message || 'Failed to add membership';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Membership</Text>
        <View style={styles.headerRight} />
      </View>
      
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Membership</Text>
            <Text style={styles.formSubtitle}>Assign a membership manually to a registered customer.</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Customer Mobile Number</Text>
              <TextInput 
                style={styles.input}
                placeholder="e.g. 9876543210"
                keyboardType="phone-pad"
                value={mobileNumber}
                onChangeText={setMobileNumber}
                maxLength={10}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Select Plan</Text>
              <View style={styles.planContainer}>
                <TouchableOpacity 
                  style={[styles.planCard, plan === 'starter' && styles.activePlan]}
                  onPress={() => handlePlanChange('starter')}
                >
                  <Text style={[styles.planTitle, plan === 'starter' && styles.activePlanText]}>Starter</Text>
                  <Text style={[styles.planPrice, plan === 'starter' && styles.activePlanText]}>₹999 / yr</Text>
                  <Text style={[styles.planDesc, plan === 'starter' && styles.activePlanDesc]}>5% Off, Max ₹499/trip</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.planCard, plan === 'plus' && styles.activePlan]}
                  onPress={() => handlePlanChange('plus')}
                >
                  <Text style={[styles.planTitle, plan === 'plus' && styles.activePlanText]}>Plus</Text>
                  <Text style={[styles.planPrice, plan === 'plus' && styles.activePlanText]}>₹1999 / yr</Text>
                  <Text style={[styles.planDesc, plan === 'plus' && styles.activePlanDesc]}>10% Off, Max ₹799/trip</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.planCard, plan === 'pro' && styles.activePlan]}
                  onPress={() => handlePlanChange('pro')}
                >
                  <Text style={[styles.planTitle, plan === 'pro' && styles.activePlanText]}>Pro</Text>
                  <Text style={[styles.planPrice, plan === 'pro' && styles.activePlanText]}>₹2999 / yr</Text>
                  <Text style={[styles.planDesc, plan === 'pro' && styles.activePlanDesc]}>12.5% Off, Max ₹999/trip</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Amount Collected</Text>
              <TextInput 
                style={[styles.input, { backgroundColor: '#E5E7EB' }]}
                value={`₹${amount}`}
                editable={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.paymentContainer}>
                {['cash', 'phonepe', 'razorpay'].map(method => (
                  <TouchableOpacity 
                    key={method}
                    style={[styles.paymentBtn, paymentMethod === method && styles.activePaymentBtn]}
                    onPress={() => setPaymentMethod(method)}
                  >
                    <Text style={[styles.paymentText, paymentMethod === method && styles.activePaymentText]}>
                      {method.charAt(0).toUpperCase() + method.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.submitBtn, loading && styles.disabledBtn]} 
              onPress={handleCreate}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Feather name="check" size={18} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.btnTextWhite}>Activate Membership</Text>
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
  formCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#F3F4F6' },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  formSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 24, lineHeight: 18 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  planContainer: { gap: 10 },
  planCard: { padding: 14, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#F9FAFB' },
  activePlan: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  planTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  planPrice: { fontSize: 14, fontWeight: '600', color: '#4B5563', marginBottom: 4 },
  planDesc: { fontSize: 12, color: '#6B7280' },
  activePlanText: { color: '#FFFFFF' },
  activePlanDesc: { color: '#E0E7FF' },
  paymentContainer: { flexDirection: 'row', gap: 8 },
  paymentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  activePaymentBtn: { backgroundColor: '#111827', borderColor: '#111827' },
  paymentText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  activePaymentText: { color: '#FFFFFF' },
  submitBtn: { backgroundColor: '#4F46E5', flexDirection: 'row', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  disabledBtn: { opacity: 0.7 },
  btnTextWhite: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 }
});
