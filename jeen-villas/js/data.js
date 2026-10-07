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
      name: "The Family Villa",
      subtitle: "Villa 1",
      description:
        "Spacious, serene and made for togetherness. Three bedrooms around a private pool with a waterfall feature, an open living room and a patio for long evenings outside.",
      guests: null, // TODO: maximum number of guests
      bedrooms: 3,
      bathrooms: 4,
      highlight: "Private pool",
      pricePerNight: null, // TODO: e.g. 1500 (shown as "From AED 1,500 / night")
      currency: "AED",
      amenities: [
        "Private swimming pool with waterfall feature",
        "Master bedroom with king bed and pool view",
        "Two bedrooms with twin single beds",
        "Premium linens and spacious wardrobes",
        "Modern bathrooms with premium fittings",
        "Open living and dining room",
        "Outdoor patio with shaded pergola",
        "Built-in grill for evening gatherings",
        "Fully equipped kitchen with induction cooktop",
        "Refrigerator and washing machine",
      ],
      photos: ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg", "06.jpg", "07.jpg", "08.jpg"],
    },
    {
      id: "villa-3",
      name: "Your Private Escape",
      subtitle: "Villa 3",
      description:
        "Comfort, privacy and memories. A one-bedroom hideaway for two, with a private jacuzzi and an outdoor area made to relax and unwind.",
      guests: 2,
      bedrooms: 1,
      bathrooms: 1,
      highlight: "Private jacuzzi",
      pricePerNight: null, // TODO
      currency: "AED",
      amenities: [
        "Private jacuzzi",
        "King size bed",
        "Walk-in rain shower",
        "Premium towels provided",
        "Air conditioning",
        "Smart TV",
        "Mini fridge",
        "Tea & coffee making facilities",
        "Outdoor seating under a shaded pergola",
        "Built-in grill",
      ],
      photos: ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg", "06.jpg"],
    },
  ],
};
