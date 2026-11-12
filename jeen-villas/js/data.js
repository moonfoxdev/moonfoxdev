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

  // ── 3D landscape on the home page ─────────────────────────
  terrain: {
    // A greyscale PNG (black = low, white = high) to use instead of the
    // generated mountains, e.g. "assets/terrain/heightmap.png".
    // The image covers the whole terrain square; its top edge is the back
    // of the scene (behind the villas).
    heightmap: null,
    heightScale: 90, // height in metres of pure white in the heightmap
    size: 900, // width of the terrain square in metres (villa positions use the same units)
    seed: 7, // change to get a different generated mountain range
    quality: "auto", // "auto", "high" or "low" (low: no shadows, coarser terrain)
  },

  // Photos: drop image files into assets/villas/<villa-id>/ and list
  // their file names in `photos`. The first photo is used as the cover.
  //
  // On the 3D map:
  //  available – false greys the villa out and it can't be selected
  //  map       – { x, z, rotation } position in metres from the middle of the
  //              terrain: x to the right, z towards the viewer (negative z
  //              is towards the mountains); rotation in degrees.
  //              Optional: pool: "pool" | "jacuzzi" | null (otherwise guessed
  //              from the amenities), scale for a .glb that isn't in metres.
  //  model     – path to a .glb to show instead of the built-in model,
  //              e.g. "assets/models/villa-1.glb"
  villas: [
    {
      id: "villa-1",
      tour: "xHiJJNx9nob", // Matterport 3D tour ID (from my.matterport.com/show/?m=...)
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
      available: true,
      map: { x: -44, z: 10, rotation: 18 },
      model: null,
    },
    {
      id: "villa-2",
      tour: null,
      name: "Villa 2",
      subtitle: "Villa 2",
      description: "",
      guests: null,
      bedrooms: null,
      bathrooms: null,
      highlight: null,
      pricePerNight: null,
      currency: "AED",
      amenities: [],
      photos: [],
      available: false, // shown on the 3D map only, greyed out
      map: { x: 0, z: -16, rotation: 0 },
      model: null,
    },
    {
      id: "villa-3",
      tour: "Y6P8ZuSc916", // Matterport 3D tour ID (from my.matterport.com/show/?m=...)
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
      available: true,
      map: { x: 42, z: 8, rotation: -16 },
      model: null,
    },
  ],
};
