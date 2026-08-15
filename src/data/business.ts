export const business = {
  name: 'Cerrajería del Puerto Gandía',
  shortName: 'Cerrajería del Puerto',
  phone: {
    e164: '+34687929669',
    display: '687 929 669',
  },
  domain: 'https://www.cerrajeriadelpuertogandia.com',
  address: {
    streetAddress: 'Carrer Rei, 4',
    postalCode: '46730',
    addressLocality: 'Gandía',
    addressRegion: 'Valencia',
    addressCountry: 'ES',
    display: 'Carrer Rei, 4 · Grau i Platja · Gandía',
  },
  experience: {
    years: 20,
    display: 'Más de 20 años',
  },
  availability: {
    hours: 24,
    display: '24 horas',
  },
  rating: {
    structured: '4.8',
    display: '4,8',
    best: '5',
    worst: '1',
  },
  reviews: {
    structured: '180',
    display: 'más de 180',
  },
  social: {
    facebook: 'https://www.facebook.com/cerrajeriadelpuertogandia/',
    facebookDisplay: 'https://www.facebook.com/cerrajeriadelpuertogandia/?locale=es_ES',
    instagram: 'https://www.instagram.com/cerrajeriadelpuerto/',
  },
  googleMaps: {
    placeId: 'ChIJp7hPn9DDYQ0RQhFlBpHeOuo',
    url: 'https://www.google.com/maps/search/?api=1&query=Cerrajeria+del+Puerto+Gandia&query_place_id=ChIJp7hPn9DDYQ0RQhFlBpHeOuo',
  },
  whatsapp: {
    heroMessage: 'Hola, necesito un cerrajero en La Safor. Te envío una foto de la cerradura.',
    heroUrl: 'https://wa.me/34687929669?text=Hola%2C%20necesito%20un%20cerrajero%20en%20La%20Safor.%20Te%20env%C3%ADo%20una%20foto%20de%20la%20cerradura.',
    globalMessage: 'Hola, necesito un cerrajero. Te envío una foto de la cerradura.',
    globalUrl: 'https://wa.me/34687929669?text=Hola%2C%20necesito%20un%20cerrajero.%20Te%20env%C3%ADo%20una%20foto%20de%20la%20cerradura.',
  },
  openingHoursSpecification: {
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens: '00:00',
    closes: '23:59',
  },
} as const;
