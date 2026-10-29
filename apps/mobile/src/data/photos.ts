// Free-licence stock photos from Wikimedia Commons, one per cause. They are illustrative only: the people, dogs and
// places shown are not the subjects of any sample campaign. Credits are listed in Profile > Terms & privacy.
import type { ImageSourcePropType } from 'react-native';

import type { CauseId } from './index';

export type Photo = { source: ImageSourcePropType; title: string; author: string; license: string; url: string };

export const PHOTOS: Record<CauseId, Photo> = {
  medical: { source: require('../../assets/photos/medical.jpg'), title: "Medical camp by sudheekshan foundation.jpg", author: "Chigurupati vimala", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:Medical_camp_by_sudheekshan_foundation.jpg" },
  animals: { source: require('../../assets/photos/animals.jpg'), title: "Street dog at the India Gate.jpg", author: "grabka dot org from Guelph, Canada", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Street_dog_at_the_India_Gate.jpg" },
  education: { source: require('../../assets/photos/education.jpg'), title: "Tamil Nadu school kids.jpg", author: "McKay Savage from London, UK", license: "CC BY 2.0", url: "https://commons.wikimedia.org/wiki/File:Tamil_Nadu_school_kids.jpg" },
  food: { source: require('../../assets/photos/food.jpg'), title: "Mid day meal.jpg", author: "Mulkh Singh", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Mid_day_meal.jpg" },
  environment: { source: require('../../assets/photos/environment.jpg'), title: "Women planting a tree, Umaria district, MP, India.jpg", author: "Yann (talk)", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:Women_planting_a_tree,_Umaria_district,_MP,_India.jpg" },
};
