// Razorpay's own checkout page inside the app, for approving a monthly gift (a UPI AutoPay mandate) once. The donor enters nothing
// in GoodNeighbour itself: the UPI ID, PIN and bank details only ever go to Razorpay and their UPI app. In test mode Razorpay shows
// a practice page (use the UPI ID success@razorpay); with live keys it shows the donor's real UPI apps.
import { useMemo } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useT } from '../i18n';
import { colors, space } from '../theme';
import Icon from './Icon';

export type CheckoutResult = 'ok' | 'dismiss' | 'fail';

const esc = (s: string) => s.replace(/[\\'"<>&\n]/g, ' ');

export default function SipCheckout({ visible, keyId, subscriptionId, description, name, email, onDone }: {
  visible: boolean; keyId: string; subscriptionId: string; description: string; name: string; email: string; onDone: (r: CheckoutResult, detail?: string) => void;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:sans-serif;text-align:center;padding-top:40px;color:#56685F"><p>${esc(t('sipc.opening'))}</p>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>
function post(o){window.ReactNativeWebView.postMessage(JSON.stringify(o))}
var rz=new Razorpay({key:'${esc(keyId)}',subscription_id:'${esc(subscriptionId)}',name:'GoodNeighbour',description:'${esc(description)}',
 prefill:{name:'${esc(name)}',email:'${esc(email)}'},theme:{color:'#00706E'},
 handler:function(r){post({t:'ok'})},modal:{ondismiss:function(){post({t:'dismiss'})}}});
rz.on('payment.failed',function(r){post({t:'fail',d:(r&&r.error&&r.error.description)||''})});
rz.open();
</script></body></html>`, [keyId, subscriptionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { t: CheckoutResult; d?: string };
      onDone(m.t, m.d);
    } catch { /* ignore */ }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onDone('dismiss')} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.head}>
          <Pressable onPress={() => onDone('dismiss')} accessibilityRole="button" accessibilityLabel={t('c.close')} hitSlop={10} style={styles.close}><Icon name="close" size={22} color={colors.ink} /></Pressable>
          <Text style={styles.title}>{t('sipc.title')}</Text>
        </View>
        <WebView
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://goodneighbour.app' }}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(req) => {
            // UPI apps open through upi:// or intent:// links: hand those to the phone.
            if (/^(upi|intent|phonepe|paytmmp|tez|gpay|whatsapp):/i.test(req.url)) { Linking.openURL(req.url).catch(() => undefined); return false; }
            return true;
          }}
          style={styles.web}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.s },
  close: { padding: 6 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  web: { flex: 1 },
});
