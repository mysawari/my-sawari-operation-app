import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';

export function AnimatedSplash({ isReady, children }) {
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 12, friction: 5, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(titleTranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(taglineOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(taglineTranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ])
    ]).start();
  }, []);

  useEffect(() => {
    if (isReady) {
      setTimeout(() => {
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => setIsAnimationComplete(true));
      }, 300);
    }
  }, [isReady]);

  return (
    <View style={styles.container}>
      {children}
      {!isAnimationComplete && (
        <Animated.View
          pointerEvents="auto"
          style={[styles.splashScreen, { opacity: opacityAnim }]}>
          <View style={styles.content}>
            <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
              <Image
                source={require('../../assets/images/MySawari.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </Animated.View>

            <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleTranslateY }], marginTop: 4 }}>
              <Text style={styles.titleText}>MySawari</Text>
            </Animated.View>

            <Animated.View style={{ opacity: taglineOpacity, transform: [{ translateY: taglineTranslateY }], marginTop: 6 }}>
              <Text style={styles.tagline}>Your ride, your way.</Text>
            </Animated.View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  splashScreen: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
    backgroundColor: '#FAFAF9',
  },
  content: { alignItems: 'center', justifyContent: 'center' },
  logoImage: { width: 220, height: 110, marginBottom: 0 },
  titleText: {
    fontWeight: '700',
    fontSize: 32,
    letterSpacing: -0.5,
    color: '#000',
  },
  tagline: {
    fontWeight: '500',
    fontSize: 15,
    letterSpacing: 0.3,
    color: '#6B7280',
  }
});
