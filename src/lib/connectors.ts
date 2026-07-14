// Mobile connector catalog — ported from the web builder's ConnectorsPanel.
// Each connector "connects" by saving its API key(s) to the user's vault
// (/api/secrets), then sending `prompt` to the builder so the AI wires it in;
// deploy injects the vault secrets as env vars. Supabase and other OAuth/browser
// connectors are intentionally omitted for this v1 (they need a redirect flow).

export type SecretKey = { name: string; placeholder: string };

export type Connector = {
  id: string;
  name: string;
  desc: string;
  icon: string; // emoji glyph
  color: string;
  category: string;
  prompt: string;
  secretKeys?: SecretKey[];
};

export const CONNECTORS: Connector[] = [
  // Database & Auth
  { id: 'firebase', name: 'Firebase', desc: 'Auth, Firestore, Cloud Functions', icon: '🔥', color: '#FFCA28', category: 'Database & Auth', prompt: 'Add Firebase authentication and Firestore database.', secretKeys: [{ name: 'FIREBASE_API_KEY', placeholder: 'AIza...' }, { name: 'FIREBASE_PROJECT_ID', placeholder: 'my-project-id' }] },
  { id: 'neon', name: 'Neon', desc: 'Serverless Postgres', icon: '🐘', color: '#00E5A0', category: 'Database & Auth', prompt: 'Add Neon serverless Postgres database with connection pooling.', secretKeys: [{ name: 'DATABASE_URL', placeholder: 'postgres://...' }] },
  { id: 'planetscale', name: 'PlanetScale', desc: 'Serverless MySQL', icon: '🌍', color: '#F4F4F5', category: 'Database & Auth', prompt: 'Add PlanetScale database connection with Drizzle ORM.', secretKeys: [{ name: 'DATABASE_URL', placeholder: 'mysql://...' }] },
  { id: 'mongodb', name: 'MongoDB Atlas', desc: 'Document database', icon: '🍃', color: '#47A248', category: 'Database & Auth', prompt: 'Add MongoDB Atlas with Mongoose for document storage.', secretKeys: [{ name: 'MONGODB_URI', placeholder: 'mongodb+srv://...' }] },
  { id: 'convex', name: 'Convex', desc: 'Reactive backend-as-a-service', icon: '🔺', color: '#EE5522', category: 'Database & Auth', prompt: 'Add Convex backend with real-time queries and mutations.', secretKeys: [{ name: 'CONVEX_DEPLOY_KEY', placeholder: 'prod:...' }] },
  { id: 'clerk', name: 'Clerk', desc: 'Drop-in auth & user management', icon: '🔐', color: '#6C47FF', category: 'Database & Auth', prompt: 'Add Clerk authentication with sign-in, sign-up, and user profile components.', secretKeys: [{ name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', placeholder: 'pk_...' }, { name: 'CLERK_SECRET_KEY', placeholder: 'sk_...' }] },
  { id: 'auth0', name: 'Auth0', desc: 'Identity & access management', icon: '🛡', color: '#EB5424', category: 'Database & Auth', prompt: 'Add Auth0 authentication with social login, MFA, and session management.', secretKeys: [{ name: 'AUTH0_CLIENT_ID', placeholder: 'client id' }, { name: 'AUTH0_CLIENT_SECRET', placeholder: 'client secret' }] },
  { id: 'appwrite', name: 'Appwrite', desc: 'Open-source backend', icon: '🏗', color: '#FD366E', category: 'Database & Auth', prompt: 'Add Appwrite backend for auth, database, storage, and functions.', secretKeys: [{ name: 'NEXT_PUBLIC_APPWRITE_ENDPOINT', placeholder: 'https://cloud.appwrite.io/v1' }, { name: 'NEXT_PUBLIC_APPWRITE_PROJECT_ID', placeholder: 'project id' }] },

  // Payments
  { id: 'stripe', name: 'Stripe', desc: 'Payments, subscriptions, invoices', icon: '💳', color: '#635BFF', category: 'Payments', prompt: 'Add Stripe payment integration with checkout, subscriptions, and webhook handling.', secretKeys: [{ name: 'STRIPE_SECRET_KEY', placeholder: 'sk_live_... or sk_test_...' }] },
  { id: 'lemonsqueezy', name: 'Lemon Squeezy', desc: 'Payments for SaaS & digital products', icon: '🍋', color: '#FFC233', category: 'Payments', prompt: 'Add Lemon Squeezy for product sales with checkout overlay and license key validation.', secretKeys: [{ name: 'LEMONSQUEEZY_API_KEY', placeholder: 'api key' }] },
  { id: 'paypal', name: 'PayPal', desc: 'Online payments', icon: '🅿', color: '#003087', category: 'Payments', prompt: 'Add PayPal payment buttons with checkout and order management.', secretKeys: [{ name: 'PAYPAL_CLIENT_ID', placeholder: 'client id' }, { name: 'PAYPAL_CLIENT_SECRET', placeholder: 'client secret' }] },
  { id: 'razorpay', name: 'Razorpay', desc: 'Payments for India & global', icon: '💰', color: '#0C2451', category: 'Payments', prompt: 'Add Razorpay payment gateway with checkout and subscription billing.', secretKeys: [{ name: 'RAZORPAY_KEY_ID', placeholder: 'key id' }, { name: 'RAZORPAY_KEY_SECRET', placeholder: 'key secret' }] },

  // AI & ML
  { id: 'openai', name: 'OpenAI', desc: 'GPT, DALL-E, Whisper, Embeddings', icon: '🤖', color: '#74AA9C', category: 'AI & ML', prompt: 'Add OpenAI API integration for chat completions, embeddings, and image generation.', secretKeys: [{ name: 'OPENAI_API_KEY', placeholder: 'sk-...' }] },
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude AI models', icon: '🧠', color: '#CC785C', category: 'AI & ML', prompt: 'Add Anthropic Claude API for AI chat, analysis, and content generation.', secretKeys: [{ name: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-...' }] },
  { id: 'replicate', name: 'Replicate', desc: 'Run ML models via API', icon: '🎨', color: '#0A0A0A', category: 'AI & ML', prompt: 'Add Replicate API to run image generation, video, and audio ML models.', secretKeys: [{ name: 'REPLICATE_API_TOKEN', placeholder: 'r8_...' }] },
  { id: 'huggingface', name: 'Hugging Face', desc: 'Open-source ML models', icon: '🤗', color: '#FFD21E', category: 'AI & ML', prompt: 'Add Hugging Face Inference API for NLP, image, and audio models.', secretKeys: [{ name: 'HUGGINGFACE_API_KEY', placeholder: 'hf_...' }] },
  { id: 'pinecone', name: 'Pinecone', desc: 'Vector database for AI', icon: '🌲', color: '#4338CA', category: 'AI & ML', prompt: 'Add Pinecone vector database for semantic search and RAG.', secretKeys: [{ name: 'PINECONE_API_KEY', placeholder: 'api key' }] },

  // Email & Messaging
  { id: 'resend', name: 'Resend', desc: 'Modern email API', icon: '📧', color: '#0EA5E9', category: 'Email & Messaging', prompt: 'Add Resend for transactional emails with React Email templates.', secretKeys: [{ name: 'RESEND_API_KEY', placeholder: 're_...' }] },
  { id: 'sendgrid', name: 'SendGrid', desc: 'Email delivery at scale', icon: '📨', color: '#1A82E2', category: 'Email & Messaging', prompt: 'Add SendGrid for sending transactional and marketing emails.', secretKeys: [{ name: 'SENDGRID_API_KEY', placeholder: 'SG...' }] },
  { id: 'twilio', name: 'Twilio', desc: 'SMS, voice, WhatsApp', icon: '📱', color: '#F22F46', category: 'Email & Messaging', prompt: 'Add Twilio for SMS notifications, voice calls, and WhatsApp messaging.', secretKeys: [{ name: 'TWILIO_ACCOUNT_SID', placeholder: 'AC...' }, { name: 'TWILIO_AUTH_TOKEN', placeholder: 'auth token' }] },
  { id: 'stream', name: 'Stream', desc: 'Chat & activity feeds', icon: '💬', color: '#006CFF', category: 'Email & Messaging', prompt: 'Add Stream Chat for in-app messaging with channels, threads, and reactions.', secretKeys: [{ name: 'STREAM_API_KEY', placeholder: 'api key' }, { name: 'STREAM_API_SECRET', placeholder: 'api secret' }] },

  // Storage & Media
  { id: 'cloudinary', name: 'Cloudinary', desc: 'Image & video optimization', icon: '🖼', color: '#3448C5', category: 'Storage & Media', prompt: 'Add Cloudinary for image/video upload, transformation, and CDN delivery.', secretKeys: [{ name: 'CLOUDINARY_URL', placeholder: 'cloudinary://...' }] },
  { id: 'uploadthing', name: 'UploadThing', desc: 'File uploads for apps', icon: '📁', color: '#EF4444', category: 'Storage & Media', prompt: 'Add UploadThing for drag-and-drop file uploads with progress and previews.', secretKeys: [{ name: 'UPLOADTHING_TOKEN', placeholder: 'token' }] },
  { id: 'aws-s3', name: 'AWS S3', desc: 'Object storage', icon: '☁', color: '#FF9900', category: 'Storage & Media', prompt: 'Add AWS S3 for file uploads with presigned URLs and bucket management.', secretKeys: [{ name: 'AWS_ACCESS_KEY_ID', placeholder: 'AKIA...' }, { name: 'AWS_SECRET_ACCESS_KEY', placeholder: 'secret key' }] },
  { id: 'mux', name: 'Mux', desc: 'Video streaming & analytics', icon: '🎬', color: '#FB3475', category: 'Storage & Media', prompt: 'Add Mux for video upload, adaptive streaming, and playback analytics.', secretKeys: [{ name: 'MUX_TOKEN_ID', placeholder: 'token id' }, { name: 'MUX_TOKEN_SECRET', placeholder: 'token secret' }] },

  // Analytics
  { id: 'posthog', name: 'PostHog', desc: 'Product analytics & feature flags', icon: '🦔', color: '#1D4AFF', category: 'Analytics', prompt: 'Add PostHog for event tracking, session replay, feature flags, and A/B testing.', secretKeys: [{ name: 'NEXT_PUBLIC_POSTHOG_KEY', placeholder: 'phc_...' }] },
  { id: 'mixpanel', name: 'Mixpanel', desc: 'User analytics & funnels', icon: '📊', color: '#7856FF', category: 'Analytics', prompt: 'Add Mixpanel for user event tracking, funnels, and retention analysis.', secretKeys: [{ name: 'NEXT_PUBLIC_MIXPANEL_TOKEN', placeholder: 'project token' }] },
  { id: 'sentry', name: 'Sentry', desc: 'Error tracking & performance', icon: '🐛', color: '#7B68EE', category: 'Analytics', prompt: 'Add Sentry for error tracking, performance monitoring, and session replay.', secretKeys: [{ name: 'SENTRY_DSN', placeholder: 'https://...ingest.sentry.io/...' }] },
  { id: 'vercel-analytics', name: 'Vercel Analytics', desc: 'Web analytics & vitals', icon: '📈', color: '#8B8B8B', category: 'Analytics', prompt: 'Add Vercel Analytics for page views, web vitals, and audience insights.' },

  // CMS & Content
  { id: 'sanity', name: 'Sanity', desc: 'Headless CMS', icon: '📝', color: '#F36458', category: 'CMS & Content', prompt: 'Add Sanity CMS for structured content with GROQ queries and real-time previews.', secretKeys: [{ name: 'NEXT_PUBLIC_SANITY_PROJECT_ID', placeholder: 'project id' }, { name: 'SANITY_API_TOKEN', placeholder: 'api token' }] },
  { id: 'contentful', name: 'Contentful', desc: 'Content platform', icon: '📄', color: '#2478CC', category: 'CMS & Content', prompt: 'Add Contentful CMS for managing and delivering content via API.', secretKeys: [{ name: 'CONTENTFUL_SPACE_ID', placeholder: 'space id' }, { name: 'CONTENTFUL_ACCESS_TOKEN', placeholder: 'access token' }] },
  { id: 'notion', name: 'Notion API', desc: 'Notion as a database', icon: '📓', color: '#8B8B8B', category: 'CMS & Content', prompt: 'Add Notion API integration to use Notion databases as a content backend.', secretKeys: [{ name: 'NOTION_API_KEY', placeholder: 'secret_...' }] },

  // Maps & Location
  { id: 'mapbox', name: 'Mapbox', desc: 'Maps, geocoding, directions', icon: '🗺', color: '#4264FB', category: 'Maps & Location', prompt: 'Add Mapbox GL for interactive maps with markers, popups, and directions.', secretKeys: [{ name: 'NEXT_PUBLIC_MAPBOX_TOKEN', placeholder: 'pk.eyJ1...' }] },
  { id: 'google-maps', name: 'Google Maps', desc: 'Maps & Places API', icon: '📍', color: '#4285F4', category: 'Maps & Location', prompt: 'Add Google Maps with markers, search, autocomplete, and directions.', secretKeys: [{ name: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', placeholder: 'AIza...' }] },

  // Search
  { id: 'algolia', name: 'Algolia', desc: 'Instant search & discovery', icon: '🔍', color: '#003DFF', category: 'Search', prompt: 'Add Algolia for instant search with faceted filtering and typo tolerance.', secretKeys: [{ name: 'NEXT_PUBLIC_ALGOLIA_APP_ID', placeholder: 'app id' }, { name: 'ALGOLIA_ADMIN_KEY', placeholder: 'admin key' }] },

  // Scheduling
  { id: 'cal', name: 'Cal.com', desc: 'Scheduling & booking', icon: '📅', color: '#8B8B8B', category: 'Scheduling', prompt: 'Add Cal.com embed for appointment booking and scheduling.', secretKeys: [{ name: 'CAL_API_KEY', placeholder: 'cal_live_...' }] },

  // E-commerce
  { id: 'shopify', name: 'Shopify Storefront', desc: 'Headless commerce', icon: '🛒', color: '#96BF48', category: 'E-commerce', prompt: 'Add Shopify Storefront API for products, cart, and checkout.', secretKeys: [{ name: 'SHOPIFY_STOREFRONT_TOKEN', placeholder: 'token' }] },
  { id: 'snipcart', name: 'Snipcart', desc: 'Drop-in shopping cart', icon: '🛍', color: '#F5D553', category: 'E-commerce', prompt: 'Add Snipcart for a drop-in shopping cart with product management and checkout.', secretKeys: [{ name: 'NEXT_PUBLIC_SNIPCART_API_KEY', placeholder: 'api key' }] },
];

/** True once every key a connector needs is present in the vault. */
export function connectorConnected(c: Connector, vaultNames: Set<string>): boolean {
  const keys = c.secretKeys ?? [];
  if (keys.length === 0) return false; // no-key connectors are never "connected", just runnable
  return keys.every((k) => vaultNames.has(k.name.toUpperCase()));
}
