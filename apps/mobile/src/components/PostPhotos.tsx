// The photos an author attached to a post (not photos of documents), shown as a swipeable strip under the cover.
import { Image, ScrollView, StyleSheet } from 'react-native';

import { usePostPhotos } from '../state/files';
import { radius, space } from '../theme';

export default function PostPhotos({ postId }: { postId: string }) {
  const photos = usePostPhotos(postId).filter((p) => p.field !== 'docs');
  if (!photos.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.wrap}>
      {photos.map((p) => <Image key={p.id} source={{ uri: `data:image/jpeg;base64,${p.b64}` }} style={styles.img} resizeMode="cover" accessibilityIgnoresInvertColors />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.m },
  row: { paddingHorizontal: space.l, gap: space.s },
  img: { width: 220, height: 160, borderRadius: radius.m },
});
