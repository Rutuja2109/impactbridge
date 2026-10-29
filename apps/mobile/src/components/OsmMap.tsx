// A real OpenStreetMap (Leaflet inside a WebView) with a pin for every approved post that has a saved location.
// Tapping a pin shows its title; "Open" posts a message back so the app opens that post. Tiles come from
// tile.openstreetmap.org with the required credit; a busy production app should move to a paid tile provider.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { useT } from '../i18n';
import { colors, radius } from '../theme';

export type GeoItem = { id: string; lat: number; lng: number; title: string; meta: string; color: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export default function OsmMap({ items, onOpen, height = 420 }: { items: GeoItem[]; onOpen: (id: string) => void; height?: number }) {
  const { t } = useT();
  const html = useMemo(() => {
    const data = JSON.stringify(items.map((i) => ({ ...i, title: esc(i.title), meta: esc(i.meta) })));
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#m{height:100%;margin:0}.pop b{display:block;margin-bottom:2px}.pop a{color:#00736E;font-weight:700}</style></head>
<body><div id="m"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
var items=${data};var map=L.map('m',{zoomControl:true}).setView([20.6,78.9],5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
var pts=[];items.forEach(function(i){var m=L.circleMarker([i.lat,i.lng],{radius:11,color:'#fff',weight:3,fillColor:i.color,fillOpacity:1}).addTo(map);
m.bindPopup('<div class="pop"><b>'+i.title+'</b>'+i.meta+'<br><a href="#" onclick="window.ReactNativeWebView.postMessage(\\''+i.id+'\\');return false">Open</a></div>');pts.push([i.lat,i.lng]);});
if(pts.length==1)map.setView(pts[0],14);else if(pts.length>1)map.fitBounds(pts,{padding:[40,40]});
</script></body></html>`;
  }, [items]);
  return (
    <View style={[styles.wrap, { height }]} accessibilityLabel={t('map.aria')}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://goodneighbour.app' }}
        javaScriptEnabled
        onMessage={(e) => onOpen(e.nativeEvent.data)}
        style={styles.web}
      />
      {items.length === 0 ? <View style={styles.none} pointerEvents="none"><Text style={styles.noneText}>{t('map.none')}</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.m, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  web: { flex: 1 },
  none: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: radius.s, padding: 10 },
  noneText: { color: colors.ink, fontSize: 14 },
});
