// Native-only interface text that the prototype does not have (the prototype opens forms that the native app
// builds in a later stage, and shares a web link the app does not have yet). Every key exists in all three languages.
export const NATIVE: Record<'en' | 'hi' | 'mr', Record<string, string>> = {
  en: {
    'n.formLater': 'This form comes in the next stage. Nothing is sent or saved.',
    'n.shareNote': 'Demo: there is no public campaign link yet. Sharing sends only this message text from your phone.',
    'n.shareBtn': 'Share message',
  },
  hi: {
    'n.formLater': 'यह फ़ॉर्म अगले चरण में आएगा। कुछ भी भेजा या सहेजा नहीं जाता।',
    'n.shareNote': 'डेमो: अभी अभियान का कोई सार्वजनिक लिंक नहीं है। साझा करने पर आपके फ़ोन से सिर्फ़ यह संदेश जाता है।',
    'n.shareBtn': 'संदेश साझा करें',
  },
  mr: {
    'n.formLater': 'हा फॉर्म पुढच्या टप्प्यात येईल. काहीही पाठवले किंवा जतन केले जात नाही.',
    'n.shareNote': 'डेमो: अजून मोहिमेची सार्वजनिक लिंक नाही. शेअर केल्यावर तुमच्या फोनवरून फक्त हा संदेश जातो.',
    'n.shareBtn': 'संदेश शेअर करा',
  },
};
