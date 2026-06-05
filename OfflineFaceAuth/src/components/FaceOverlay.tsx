/**
 * FaceOverlay.tsx  (v2)
 * Animated camera overlay: detection box, status banner, challenge ring.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { LivenessChallenge } from '../utils/livenessUtils';

const { width: W, height: H } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverlayStatus =
  | 'idle'        // waiting to scan
  | 'challenge'   // scanning, no recognition yet
  | 'liveness'    // recognized, doing challenge
  | 'pass'        // all checks passed
  | 'fail'        // failed (spoof/unknown)
  | 'spoof';      // explicit spoof rejection

interface Props {
  status:             OverlayStatus;
  challenge?:         LivenessChallenge;
  challengeTimeLeft?: number;
  personName?:        string;
  similarity?:        number;
  livenessScore?:     number;
  message?:           string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OVAL_W = W * 0.62;
const OVAL_H = OVAL_W * 1.35;
const OVAL_L = (W - OVAL_W) / 2;
const OVAL_T = (H - OVAL_H) / 2 - 60;

const STATUS_COLORS: Record<OverlayStatus, string> = {
  idle:      '#607D8B',
  challenge: '#00BCD4',
  liveness:  '#FF9800',
  pass:      '#4CAF50',
  fail:      '#F44336',
  spoof:     '#E91E63',
};

const STATUS_LABELS: Record<OverlayStatus, string> = {
  idle:      'Position your face in the oval',
  challenge: 'Scanning...',
  liveness:  'Identity confirmed — Complete challenge',
  pass:      'ACCESS GRANTED',
  fail:      'ACCESS DENIED',
  spoof:     'SPOOF DETECTED',
};

// ─── FaceOverlay ─────────────────────────────────────────────────────────────

export default function FaceOverlay({
  status, personName, similarity, livenessScore, message,
}: Props) {
  const borderAnim  = useRef(new Animated.Value(0)).current;
  const bannerAnim  = useRef(new Animated.Value(0)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;

  const color = STATUS_COLORS[status];

  // Animate border color on status change
  useEffect(() => {
    Animated.timing(borderAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();
    return () => { borderAnim.setValue(0); };
  }, [status, borderAnim]);

  // Pulse on pass
  useEffect(() => {
    if (status === 'pass') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 400, useNativeDriver: true }),
        ]),
        { iterations: 3 },
      ).start();
    }
    pulseAnim.setValue(1);
  }, [status, pulseAnim]);

  // Slide banner
  useEffect(() => {
    Animated.spring(bannerAnim, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }).start();
    return () => bannerAnim.setValue(0);
  }, [status, bannerAnim]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Dark vignette around oval */}
      <View style={styles.vignette} />

      {/* Face oval guide */}
      <Animated.View style={[styles.oval, {
        borderColor: color,
        transform: [{ scale: pulseAnim }],
        shadowColor: color,
      }]} />

      {/* Corner brackets */}
      {(['tl', 'tr', 'bl', 'br'] as const).map(corner => (
        <View key={corner} style={[styles.bracket, bracketStyle(corner), { borderColor: color }]} />
      ))}

      {/* Status label below oval */}
      <Animated.View style={[styles.statusLabel, {
        opacity: bannerAnim,
        transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0,1], outputRange: [10, 0] }) }],
        backgroundColor: `${color}22`,
        borderColor: `${color}55`,
      }]}>
        <Text style={[styles.statusText, { color }]}>
          {STATUS_LABELS[status]}
        </Text>
      </Animated.View>

      {/* Person name banner — shown on pass/liveness */}
      {(status === 'pass' || status === 'liveness') && personName && (
        <Animated.View style={[styles.personBanner, {
          opacity: bannerAnim,
          backgroundColor: `${color}22`,
          borderColor: `${color}55`,
          transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0,1], outputRange: [-10, 0] }) }],
        }]}>
          <Text style={styles.personName}>{personName}</Text>
          {similarity !== undefined && (
            <Text style={[styles.personSim, { color }]}>
              {(similarity * 100).toFixed(1)}% confidence
            </Text>
          )}
          {livenessScore !== undefined && (
            <Text style={styles.livenessLabel}>
              Liveness {(livenessScore * 100).toFixed(0)}%
            </Text>
          )}
        </Animated.View>
      )}

      {/* Full-screen pass overlay */}
      {status === 'pass' && (
        <View style={styles.passOverlay} pointerEvents="none">
          <Text style={styles.passIcon}>✅</Text>
          <Text style={styles.passText}>ATTENDANCE LOGGED</Text>
        </View>
      )}

      {/* Spoof warning */}
      {status === 'spoof' && (
        <View style={styles.spoofOverlay}>
          <Text style={styles.spoofIcon}>⚠️</Text>
          <Text style={styles.spoofText}>SPOOF DETECTED</Text>
          <Text style={styles.spoofSub}>Use your real face, not a photo or screen.</Text>
        </View>
      )}
    </View>
  );
}

// ─── Corner Bracket Helper ────────────────────────────────────────────────────
const BRACKET = 22;
const THICK   = 3;

function bracketStyle(corner: 'tl' | 'tr' | 'bl' | 'br') {
  const base = { position: 'absolute' as const, width: BRACKET, height: BRACKET, borderColor: '#00BCD4' };
  const left = OVAL_L - 2;
  const right = OVAL_L + OVAL_W - BRACKET + 2;
  const top  = OVAL_T - 2;
  const btm  = OVAL_T + OVAL_H - BRACKET + 2;
  switch (corner) {
    case 'tl': return { ...base, top, left,  borderTopWidth: THICK, borderLeftWidth:  THICK };
    case 'tr': return { ...base, top, left: right, borderTopWidth: THICK, borderRightWidth: THICK };
    case 'bl': return { ...base, top: btm, left,  borderBottomWidth: THICK, borderLeftWidth:  THICK };
    case 'br': return { ...base, top: btm, left: right, borderBottomWidth: THICK, borderRightWidth: THICK };
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  vignette: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0D111788',
  },
  oval: {
    position: 'absolute',
    top: OVAL_T, left: OVAL_L,
    width: OVAL_W, height: OVAL_H,
    borderRadius: OVAL_W,
    borderWidth: 2.5,
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    backgroundColor: 'transparent',
  },
  bracket: {
    position: 'absolute',
    borderRadius: 2,
  },
  statusLabel: {
    position: 'absolute',
    top: OVAL_T + OVAL_H + 16,
    left: 32, right: 32,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 10, borderWidth: 1,
    alignItems: 'center',
  },
  statusText: {
    fontFamily: 'Roboto-Bold',
    fontSize: 14,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  personBanner: {
    position: 'absolute',
    top: OVAL_T - 80,
    left: 32, right: 32,
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 16,
    alignItems: 'center', gap: 2,
  },
  personName:   { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 18 },
  personSim:    { fontFamily: 'Roboto-Regular', fontSize: 13 },
  livenessLabel: { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 11 },

  passOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#4CAF5022', gap: 12,
  },
  passIcon: { fontSize: 72 },
  passText: { color: '#4CAF50', fontFamily: 'Roboto-Bold', fontSize: 22, letterSpacing: 2 },

  spoofOverlay: {
    position: 'absolute', bottom: 140, left: 24, right: 24,
    backgroundColor: '#E91E6322', borderRadius: 16, borderWidth: 1,
    borderColor: '#E91E6355', padding: 20, alignItems: 'center', gap: 8,
  },
  spoofIcon: { fontSize: 40 },
  spoofText: { color: '#E91E63', fontFamily: 'Roboto-Bold', fontSize: 18, letterSpacing: 1.5 },
  spoofSub:  { color: '#E91E63AA', fontFamily: 'Roboto-Regular', fontSize: 13, textAlign: 'center' },
});
