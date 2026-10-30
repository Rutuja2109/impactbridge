// Full-screen map for pinning the exact place of a post. The person can search a place (OpenStreetMap search), tap the map,
// drag the pin, or use their phone's GPS. Every pin is checked against the map data:
//   1. it must resolve to a real mapped place inside India (nothing in the sea, a field with no name or another country);
//   2. the city, area and full address are filled in from that real address, so what is saved is what the map says;
//   3. if the phone's GPS was used, the distance between the phone and the pin is recorded: within 300 m counts as "at the
//      place"; further away is saved as "pinned from elsewhere" and the reviewer sees that.
// Nothing here can prove a person is honest (GPS can be faked), so the reviewer stays the final check.
import * as Location from 'expo-location';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useT } from '../i18n';
import { colors, radius, space } from '../theme';
import Icon from './Icon';
import { Button } from './ui';

export type Picked = { lat: number; lng: number; name: string; city: string; area: string; state: string; via: 'gps' | 'search' | 'pin'; dist?: number };
type Res = { error?: string; display_name?: string; address?: Record<string, string> } | null;

const km = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r; const dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
export const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

const esc = (s: string) => s.replace(/[\\'"<>&\n]/g, ' ');

export default function LocationPicker({ visible, initial, onClose, onPick }: { visible: boolean; initial?: { lat: number; lng: number } | null; onClose: () => void; onPick: (p: Picked) => void }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState<Picked | null>(null);
  const [gps, setGps] = useState<[number, number] | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);

  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#m{height:100%;margin:0;font-family:sans-serif}
#bar{position:absolute;z-index:1000;left:8px;right:8px;top:8px;display:flex;gap:6px}
#q{flex:1;padding:12px;border:1px solid #ccc;border-radius:10px;font-size:16px;background:#fff}
#go{padding:0 16px;border:0;border-radius:10px;background:#00706E;color:#fff;font-weight:700;font-size:15px}
#res{position:absolute;z-index:1000;left:8px;right:8px;top:62px;background:#fff;border-radius:10px;max-height:40%;overflow:auto;display:none;box-shadow:0 2px 12px rgba(0,0,0,.25)}
#res div{padding:12px;border-bottom:1px solid #eee;font-size:14px}#res .none{color:#666}</style></head>
<body><div id="bar"><input id="q" placeholder="${esc(t('lp.search'))}"/><button id="go">${esc(t('lp.go'))}</button></div><div id="res"></div><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
var NONE="${esc(t('lp.none'))}";
function post(o){window.ReactNativeWebView.postMessage(JSON.stringify(o))}
var map=L.map('m',{zoomControl:false}).setView([${initial ? `${initial.lat},${initial.lng}` : '20.6,78.9'}],${initial ? 17 : 5});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
var marker=null;
function reverse(lat,lng,via){post({t:'busy'});
 fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=en&lat='+lat+'&lon='+lng)
 .then(function(r){return r.json()}).then(function(j){post({t:'pos',lat:lat,lng:lng,via:via,res:j})}).catch(function(){post({t:'pos',lat:lat,lng:lng,via:via,res:null})})}
function put(lat,lng,via,zoom){
 if(!marker){marker=L.marker([lat,lng],{draggable:true}).addTo(map);marker.on('dragend',function(){var p=marker.getLatLng();reverse(p.lat,p.lng,'pin')})}else marker.setLatLng([lat,lng]);
 map.setView([lat,lng],zoom||Math.max(map.getZoom(),17));reverse(lat,lng,via)}
map.on('click',function(e){put(e.latlng.lat,e.latlng.lng,'pin',map.getZoom())});
window.setGps=function(lat,lng){put(lat,lng,'gps',18)};
var res=document.getElementById('res');
function search(){var q=document.getElementById('q').value.trim();if(!q)return;res.style.display='block';res.innerHTML='<div class="none">…</div>';
 fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=in&accept-language=en&q='+encodeURIComponent(q))
 .then(function(r){return r.json()}).then(function(list){res.innerHTML='';if(!list.length){res.innerHTML='<div class="none">'+NONE+'</div>';return}
  list.forEach(function(it){var d=document.createElement('div');d.textContent=it.display_name;d.onclick=function(){res.style.display='none';put(parseFloat(it.lat),parseFloat(it.lon),'search',16)};res.appendChild(d)})})
 .catch(function(){res.innerHTML='<div class="none">'+NONE+'</div>'})}
document.getElementById('go').onclick=search;
document.getElementById('q').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();search()}});
${initial ? `put(${initial.lat},${initial.lng},'pin',17);` : ''}
</script></body></html>`, [initial?.lat, initial?.lng, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { t: string; lat?: number; lng?: number; via?: 'gps' | 'search' | 'pin'; res?: Res };
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.t === 'busy') { setBusy(true); setFound(null); setError(''); return; }
    if (m.t !== 'pos' || m.lat === undefined || m.lng === undefined) return;
    setBusy(false);
    const r = m.res;
    if (!r) { setError(t('lp.errNet')); return; }
    if (r.error || !r.address) { setError(t('lp.errNone')); return; }
    if (r.address.country_code !== 'in') { setError(t('lp.errIn')); return; }
    const a = r.address;
    setFound({
      lat: m.lat, lng: m.lng, via: m.via ?? 'pin',
      name: (r.display_name ?? '').slice(0, 160),
      city: a.city || a.town || a.village || a.municipality || a.county || a.state_district || '',
      area: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.hamlet || '',
      state: a.state || '',
    });
  };

  const useGps = async () => {
    setGpsBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setError(t('pin.denied')); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setGps([pos.coords.latitude, pos.coords.longitude]);
      web.current?.injectJavaScript(`window.setGps(${pos.coords.latitude},${pos.coords.longitude});true;`);
    } catch { setError(t('pin.fail')); } finally { setGpsBusy(false); }
  };

  const dist = found && gps ? km([found.lat, found.lng], gps) * 1000 : undefined;
  const confirm = () => {
    if (!found) return;
    // Within 300 m of the phone's GPS counts as "at the place"; otherwise the source stays search/pin and the distance is saved.
    const via = dist !== undefined && dist <= 300 ? 'gps' : found.via === 'gps' ? 'pin' : found.via;
    onPick({ ...found, via, dist });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.head}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('c.close')} hitSlop={10} style={styles.close}><Icon name="close" size={22} color={colors.ink} /></Pressable>
          <Text style={styles.title}>{t('lp.title')}</Text>
        </View>
        <WebView ref={web} originWhitelist={['*']} source={{ html, baseUrl: 'https://goodneighbour.app' }} javaScriptEnabled onMessage={onMessage} style={styles.web} />
        <View style={[styles.panel, { paddingBottom: space.m + insets.bottom }]}>
          {busy ? <View style={styles.row}><ActivityIndicator color={colors.tealDark} /><Text style={styles.small}>{t('lp.checking')}</Text></View> : null}
          {error ? <Text style={styles.err}>{error}</Text> : null}
          {!busy && !error && !found ? <Text style={styles.small}>{t('lp.hint')}</Text> : null}
          {found && !busy ? (
            <View style={styles.found}>
              <Text style={styles.addr} numberOfLines={3}>{found.name}</Text>
              <Text style={styles.small}>{t(`lp.src.${found.via}`)}{dist !== undefined ? ` · ${dist <= 300 ? t('lp.at') : t('lp.far', { d: fmtDist(dist) })}` : ''}</Text>
            </View>
          ) : null}
          <View style={styles.btns}>
            <View style={styles.flex}><Button label={t('lp.gps')} icon="pin" variant="ghost" small block disabled={gpsBusy} onPress={useGps} /></View>
            <View style={styles.flex}><Button label={t('lp.confirm')} small block disabled={!found || busy} onPress={confirm} /></View>
          </View>
        </View>
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
  panel: { gap: space.s, padding: space.m, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  small: { fontSize: 13, color: colors.slate },
  err: { fontSize: 14, fontWeight: '700', color: colors.brick },
  found: { gap: 2 },
  addr: { fontSize: 14, fontWeight: '700', color: colors.ink },
  btns: { flexDirection: 'row', gap: space.s },
  flex: { flex: 1 },
});
