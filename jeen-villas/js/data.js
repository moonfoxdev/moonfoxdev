// ─────────────────────────────────────────────────────────────
//  JÉEN Villas — all editable content lives in this file.
//  Fill in the TODO fields; the app picks changes up on reload.
// ─────────────────────────────────────────────────────────────

window.JEEN = {
  brand: {
    name: "JÉEN",
    tagline: "Private villas in the mountains",
    intro:
      "Quiet stone, open sky and the mountain at your doorstep. JÉEN is a small collection of private villas made for slow days and long evenings.",
    // TODO: set your real location, e.g. "Ras Al Khaimah, UAE"
    location: "",
  },

  contact: {
    instagram: "jeen.villas",
    // TODO: WhatsApp number in international format, digits only, e.g. "971501234567"
    whatsapp: "",
    // TODO: booking email, e.g. "stay@jeenvillas.com"
    email: "",
    // TODO: phone number to display, e.g. "+971 50 123 4567"
    phone: "",
  },

  // Photos: drop image files into assets/villas/<villa-id>/ and list
  // their file names in `photos`. The first photo is used as the cover.
  villas: [
    {
      id: "villa-1",
      name: "Villa 1",
      subtitle: "Mountain view villa",
      description:
        "A private retreat facing the ridge. Wake to the light moving across the rock face and end the day under a sky full of stars.",
      guests: 6, // TODO: confirm
      bedrooms: 3, // TODO: confirm
      bathrooms: 3, // TODO: confirm
      pricePerNight: null, // TODO: e.g. 1500 (shown as "From AED 1,500 / night")
      currency: "AED",
      amenities: [
        "Private pool",
        "Mountain views",
        "Outdoor seating & firepit",
        "Fully equipped kitchen",
        "Free parking",
        "Wi-Fi",
      ],
      photos: [
        // "01.jpg", "02.jpg", "03.jpg"
      ],
    },
    {
      id: "villa-3",
      name: "Villa 3",
      subtitle: "Garden villa",
      description:
        "Calm, open and close to the land. Space to gather with family and friends, with the mountain as your backdrop.",
      guests: 6, // TODO: confirm
      bedrooms: 3, // TODO: confirm
      bathrooms: 3, // TODO: confirm
      pricePerNight: null,
      currency: "AED",
      amenities: [
        "Private pool",
        "Garden & terrace",
        "BBQ area",
        "Fully equipped kitchen",
        "Free parking",
        "Wi-Fi",
      ],
      photos: [],
    },
  ],
};
