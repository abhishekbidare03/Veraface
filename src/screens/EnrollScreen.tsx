/**
 * EnrollScreen.tsx  (v2)
 * Enroll a new face with improved camera API and visual feedback.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { faceAuthService } from '../services/FaceAuthService';

const REQUIRED_FRAMES = 5;

type EnrollPhase = 'form' | 'capturing' | 'processing' | 'success' | 'error';

export default function EnrollScreen() {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const camera = useRef<Camera>(null);

  const [phase, setPhase] = useState<EnrollPhase>('form');
  const [name,  setName]  = useState('');
  const [empId, setEmpId] = useState('');
  const [capturedCount, setCapturedCount] = useState(0);
  const [error,    setError]    = useState('');
  const [personId, setPersonId] = useState('');

  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Animate progress
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: capturedCount / REQUIRED_FRAMES,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [capturedCount, progressAnim]);

  // Pulse while capturing
  useEffect(() => {
    if (phase === 'capturing') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 500, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
    pulseAnim.setValue(1);
  }, [phase, pulseAnim]);

  const validateForm = () => {
    if (!name.trim())  { Alert.alert('Missing Name', 'Please enter a full name.');        return false; }
    if (!empId.trim()) { Alert.alert('Missing Employee ID', 'Please enter an employee ID.'); return false; }
    return true;
  };

  const startEnrollment = async () => {
    if (!validateForm()) return;
    setCapturedCount(0);
    setPhase('capturing');

    const frames: string[] = [];
    for (let i = 0; i < REQUIRED_FRAMES; i++) {
      try {
        if (!camera.current) break;
        const photo = await camera.current.takePhoto({ flash: 'off' });
        frames.push(photo.path);
        setCapturedCount(i + 1);
        await new Promise<void>(r => setTimeout(r, 600));
      } catch (e) {
        console.warn('[Enroll] frame capture error:', e);
      }
    }

    if (frames.length < 3) {
      setError('Only captured ' + frames.length + ' frames. Please ensure good lighting and hold still.');
      setPhase('error');
      return;
    }

    setPhase('processing');
    const result = await faceAuthService.enrollPerson(frames, name.trim(), empId.trim());
    if (result.success && result.personId) {
      setPersonId(result.personId);
      setPhase('success');
    } else {
      setError(result.error ?? 'Enrollment failed. Try again in better lighting.');
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('form');
    setName('');
    setEmpId('');
    setCapturedCount(0);
    setError('');
    setPersonId('');
  };

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permText}>📷 Camera access needed for enrollment</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Camera preview panel */}
        {device && (
          <View style={[styles.cameraPanel, phase === 'form' && { height: 0 }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: pulseAnim }] }]}>
              <Camera
                ref={camera}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={phase === 'capturing'}
                photo
              />
            </Animated.View>

            {/* Oval face guide */}
            <View style={styles.ovalGuide} />

            {/* Capture progress overlay */}
            {phase === 'capturing' && (
              <View style={styles.captureOverlay}>
                <Text style={styles.captureTitle}>
                  📸 {capturedCount}/{REQUIRED_FRAMES} frames captured
                </Text>
                <Text style={styles.captureHint}>Hold still — looking straight at camera</Text>
                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {phase === 'processing' && (
              <View style={styles.processingOverlay}>
                <Text style={styles.processingText}>⚙️ Generating biometric template...</Text>
                <Text style={styles.processingHint}>Averaging {REQUIRED_FRAMES} embeddings</Text>
              </View>
            )}
          </View>
        )}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* ── Form ── */}
          {phase === 'form' && (
            <>
              <Text style={styles.title}>Enroll New Personnel</Text>
              <Text style={styles.subtitle}>
                Capture {REQUIRED_FRAMES} frames to build a secure 128-D biometric template.
                Raw face images are never stored.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Rajesh Kumar"
                  placeholderTextColor="#607D8B"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Employee ID</Text>
                <TextInput
                  style={styles.input}
                  value={empId}
                  onChangeText={setEmpId}
                  placeholder="e.g. EMP-2024-001"
                  placeholderTextColor="#607D8B"
                  autoCapitalize="characters"
                  returnKeyType="done"
                />
              </View>

              <View style={styles.privacyCard}>
                <Text style={styles.privacyTitle}>🔒 Privacy Notice</Text>
                <Text style={styles.privacyText}>
                  Only a 512-byte irreversible mathematical embedding is stored in the
                  AES-256 encrypted local database. Raw face images are processed in RAM
                  and immediately discarded.
                </Text>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={startEnrollment}>
                <Text style={styles.primaryBtnText}>📸 Start Enrollment Capture</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Success ── */}
          {phase === 'success' && (
            <View style={styles.resultBox}>
              <Text style={styles.resultIcon}>✅</Text>
              <Text style={styles.resultTitle}>Enrollment Successful!</Text>
              <Text style={styles.resultSub}>{name} has been registered in the system.</Text>
              <View style={styles.idBox}>
                <Text style={styles.idLabel}>EMPLOYEE ID</Text>
                <Text style={styles.idValue}>{empId}</Text>
                <Text style={styles.idLabel}>PERSON UUID</Text>
                <Text style={styles.idValue} numberOfLines={1}>{personId}</Text>
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={reset}>
                <Text style={styles.primaryBtnText}>➕ Enroll Another Person</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Error ── */}
          {phase === 'error' && (
            <View style={styles.resultBox}>
              <Text style={styles.resultIcon}>❌</Text>
              <Text style={[styles.resultTitle, { color: '#F44336' }]}>Enrollment Failed</Text>
              <Text style={styles.resultSub}>{error}</Text>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#C62828' }]} onPress={reset}>
                <Text style={styles.primaryBtnText}>🔄 Try Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0D1117' },
  center:      { flex: 1, backgroundColor: '#0D1117', justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  permText:    { color: '#FFFFFF', fontSize: 16, fontFamily: 'Roboto-Regular', textAlign: 'center' },
  permBtn:     { backgroundColor: '#7B1FA2', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  permBtnText: { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 16 },

  cameraPanel: { height: 340, overflow: 'hidden', position: 'relative' },
  ovalGuide: {
    position: 'absolute', top: '8%', left: '20%', width: '60%', height: '84%',
    borderRadius: 200, borderWidth: 2, borderColor: '#7B1FA299', borderStyle: 'dashed',
  },
  captureOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#0D1117CC', padding: 16, gap: 8,
  },
  captureTitle: { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 15, textAlign: 'center' },
  captureHint:  { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 12, textAlign: 'center' },
  progressTrack: { height: 6, backgroundColor: '#1C2833', borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: '#7B1FA2', borderRadius: 3 },
  processingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0D1117DD',
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  processingText: { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 18 },
  processingHint: { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 13 },

  content: { padding: 20, paddingBottom: 40 },
  title:   { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 24, marginBottom: 8 },
  subtitle: { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 14, lineHeight: 20, marginBottom: 24 },
  inputGroup: { marginBottom: 16 },
  label:    { color: '#607D8B', fontFamily: 'Roboto-Medium', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  input: {
    backgroundColor: '#161B22', borderRadius: 10, borderWidth: 1, borderColor: '#1C2833',
    color: '#FFFFFF', fontFamily: 'Roboto-Regular', fontSize: 16,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  privacyCard: {
    backgroundColor: '#0D2137', borderRadius: 10, borderWidth: 1, borderColor: '#1565C0',
    padding: 14, marginBottom: 24, gap: 6,
  },
  privacyTitle: { color: '#90CAF9', fontFamily: 'Roboto-Bold', fontSize: 13 },
  privacyText:  { color: '#90CAF9AA', fontFamily: 'Roboto-Regular', fontSize: 12, lineHeight: 18 },
  primaryBtn:   { backgroundColor: '#7B1FA2', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 16 },

  resultBox:   { alignItems: 'center', paddingTop: 20, gap: 12 },
  resultIcon:  { fontSize: 64 },
  resultTitle: { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 22 },
  resultSub:   { color: '#607D8B', fontFamily: 'Roboto-Regular', fontSize: 15, textAlign: 'center', paddingHorizontal: 20 },
  idBox: {
    backgroundColor: '#161B22', borderRadius: 12, padding: 16,
    width: '100%', gap: 4, marginTop: 8,
  },
  idLabel: { color: '#607D8B', fontFamily: 'Roboto-Medium', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2 },
  idValue: { color: '#00BCD4', fontFamily: 'Roboto-Bold', fontSize: 13, marginBottom: 8 },
});
