import type { PricePoint, Sector, StockSeed, VolumePoint } from '../types';
import { generateCloses, generateVolumes, tradingDaysBack } from './history';
import { hashString, mulberry32 } from '../random';
import { roundPrice, pctChange } from '../money';

/**
 * STATIC US STOCK & ETF SEED DATASET — SIMULATED DEMO VALUES.
 *
 * Prices, changes, volumes and market caps are illustrative values for a
 * paper-trading demo. They are NOT real-time or historical market data and
 * must never be used for investment decisions.
 */

type Exchange = StockSeed['exchange'];

// [symbol, name, sector, exchange, price, daily change %, market cap (USD bn), daily volatility %, avg volume (millions), description]
type Row = [string, string, Sector, Exchange, number, number, number, number, number, string];

const ROWS: Row[] = [
  // ---------------- Technology ----------------
  ['AAPL', 'Apple Inc.', 'Technology', 'NASDAQ', 227.52, 0.84, 3460, 1.5, 52, 'Designs consumer electronics including iPhone, Mac, iPad and wearables, plus a fast-growing services business.'],
  ['MSFT', 'Microsoft Corporation', 'Technology', 'NASDAQ', 428.14, 0.41, 3180, 1.4, 21, 'Develops Windows, Office productivity software and the Azure cloud computing platform.'],
  ['NVDA', 'NVIDIA Corporation', 'Technology', 'NASDAQ', 131.38, 2.36, 3220, 3.2, 245, 'Designs GPUs and accelerated computing platforms used for AI, data centers and gaming.'],
  ['AMD', 'Advanced Micro Devices, Inc.', 'Technology', 'NASDAQ', 156.24, -1.42, 253, 3.1, 42, 'Designs CPUs, GPUs and adaptive SoCs for PCs, gaming consoles and data centers.'],
  ['INTC', 'Intel Corporation', 'Technology', 'NASDAQ', 22.87, -2.18, 98, 2.9, 68, 'Manufactures processors and semiconductor products and operates a foundry business.'],
  ['CRM', 'Salesforce, Inc.', 'Technology', 'NYSE', 268.41, 1.07, 258, 1.9, 6.1, 'Provides cloud-based customer relationship management software and AI agents for enterprises.'],
  ['ORCL', 'Oracle Corporation', 'Technology', 'NYSE', 172.63, 0.66, 478, 1.8, 8.4, 'Offers database software, enterprise applications and cloud infrastructure services.'],
  ['ADBE', 'Adobe Inc.', 'Technology', 'NASDAQ', 512.33, -0.58, 227, 1.8, 3.2, 'Creates creative, document and digital-experience software including Photoshop and Acrobat.'],
  ['QCOM', 'QUALCOMM Incorporated', 'Technology', 'NASDAQ', 164.82, -0.91, 183, 2.1, 7.9, 'Develops wireless technology, mobile processors and licenses foundational cellular patents.'],
  ['AVGO', 'Broadcom Inc.', 'Technology', 'NASDAQ', 171.18, 1.84, 798, 2.6, 26, 'Designs semiconductors for networking and broadband and sells infrastructure software.'],
  ['CSCO', 'Cisco Systems, Inc.', 'Technology', 'NASDAQ', 57.42, 0.23, 229, 1.2, 18, 'Provides networking hardware, security and collaboration solutions for enterprises.'],
  ['IBM', 'International Business Machines', 'Technology', 'NYSE', 221.74, -0.34, 205, 1.3, 4.2, 'Offers hybrid cloud platforms, AI software and consulting services.'],
  ['PLTR', 'Palantir Technologies Inc.', 'Technology', 'NASDAQ', 78.31, 4.12, 178, 4.1, 72, 'Builds data analytics and AI platforms for government and commercial customers.'],
  ['TXN', 'Texas Instruments Incorporated', 'Technology', 'NASDAQ', 196.47, -0.47, 179, 1.6, 5.5, 'Manufactures analog and embedded processing semiconductors.'],
  ['MU', 'Micron Technology, Inc.', 'Technology', 'NASDAQ', 102.38, 2.94, 114, 3.0, 22, 'Produces DRAM and NAND memory and storage products.'],
  ['AMAT', 'Applied Materials, Inc.', 'Technology', 'NASDAQ', 182.61, 1.21, 150, 2.4, 6.3, 'Supplies equipment and services used to manufacture semiconductor chips and displays.'],
  ['LRCX', 'Lam Research Corporation', 'Technology', 'NASDAQ', 78.92, 1.63, 102, 2.6, 11, 'Provides wafer fabrication equipment for the semiconductor industry.'],
  ['INTU', 'Intuit Inc.', 'Technology', 'NASDAQ', 638.21, 0.37, 178, 1.7, 1.6, 'Develops financial software including TurboTax, QuickBooks and Credit Karma.'],
  ['NOW', 'ServiceNow, Inc.', 'Technology', 'NYSE', 945.33, 1.48, 195, 2.0, 1.3, 'Provides cloud workflow automation software for IT, HR and customer service.'],
  ['SNOW', 'Snowflake Inc.', 'Technology', 'NYSE', 158.74, -2.67, 53, 3.4, 5.8, 'Operates a cloud data platform for data warehousing, sharing and AI workloads.'],
  ['PANW', 'Palo Alto Networks, Inc.', 'Technology', 'NASDAQ', 182.36, 0.92, 120, 2.1, 5.1, 'Provides cybersecurity platforms including firewalls and cloud security.'],
  ['CRWD', 'CrowdStrike Holdings, Inc.', 'Technology', 'NASDAQ', 345.82, 2.05, 85, 2.9, 3.4, 'Delivers cloud-native endpoint protection and threat intelligence.'],
  ['ANET', 'Arista Networks, Inc.', 'Technology', 'NYSE', 98.64, 1.36, 124, 2.7, 8.1, 'Builds high-performance cloud networking switches and software.'],
  ['DELL', 'Dell Technologies Inc.', 'Technology', 'NYSE', 118.42, -1.15, 83, 2.8, 7.2, 'Sells PCs, servers, storage and AI infrastructure.'],
  ['HPQ', 'HP Inc.', 'Technology', 'NYSE', 34.71, -0.29, 34, 1.7, 7.4, 'Manufactures personal computers, printers and related supplies.'],
  ['SMCI', 'Super Micro Computer, Inc.', 'Technology', 'NASDAQ', 42.33, -3.84, 25, 5.2, 38, 'Designs high-performance server and storage systems for AI and cloud data centers.'],
  ['MRVL', 'Marvell Technology, Inc.', 'Technology', 'NASDAQ', 88.41, 2.48, 76, 3.2, 14, 'Develops data infrastructure semiconductors for cloud, carrier and automotive markets.'],
  ['ARM', 'Arm Holdings plc (ADR)', 'Technology', 'NASDAQ', 142.56, 3.12, 150, 3.8, 6.2, 'Licenses CPU architecture and designs used in most of the world\'s smartphones.'],
  ['TSM', 'Taiwan Semiconductor Mfg. (ADR)', 'Technology', 'NYSE', 196.42, 1.54, 1018, 2.2, 14, 'World\'s largest dedicated semiconductor foundry.'],
  ['ASML', 'ASML Holding N.V. (ADR)', 'Technology', 'NASDAQ', 712.48, -0.86, 281, 2.2, 1.7, 'Builds lithography systems essential for advanced chip manufacturing.'],
  ['UBER', 'Uber Technologies, Inc.', 'Technology', 'NYSE', 72.64, 1.88, 152, 2.4, 19, 'Operates ride-hailing, food delivery and freight logistics marketplaces.'],
  ['ZM', 'Zoom Communications, Inc.', 'Technology', 'NASDAQ', 81.24, -0.62, 25, 2.0, 2.9, 'Provides video conferencing and collaboration software.'],
  ['DDOG', 'Datadog, Inc.', 'Technology', 'NASDAQ', 136.41, 1.12, 46, 2.9, 4.1, 'Offers cloud monitoring, observability and security tools.'],
  ['NET', 'Cloudflare, Inc.', 'Technology', 'NYSE', 112.54, 2.71, 38, 3.2, 3.6, 'Runs a global network providing security, performance and developer services.'],
  ['MDB', 'MongoDB, Inc.', 'Technology', 'NASDAQ', 268.07, -1.94, 20, 3.4, 1.5, 'Develops a document-oriented database platform for developers.'],
  ['SHOP', 'Shopify Inc.', 'Technology', 'NYSE', 104.62, 2.21, 135, 3.0, 9.4, 'Provides commerce software for merchants to run online and retail stores.'],

  // ---------------- Communication Services ----------------
  ['GOOGL', 'Alphabet Inc. Class A', 'Communication Services', 'NASDAQ', 176.43, 0.95, 2170, 1.8, 26, 'Parent of Google Search, YouTube, Android and Google Cloud.'],
  ['META', 'Meta Platforms, Inc.', 'Communication Services', 'NASDAQ', 585.17, 1.32, 1480, 2.3, 12, 'Operates Facebook, Instagram, WhatsApp and develops AI and mixed reality products.'],
  ['NFLX', 'Netflix, Inc.', 'Communication Services', 'NASDAQ', 892.41, -0.73, 382, 2.1, 3.1, 'Leading subscription streaming entertainment service.'],
  ['DIS', 'The Walt Disney Company', 'Communication Services', 'NYSE', 112.34, -0.41, 204, 1.6, 9.2, 'Global entertainment company spanning parks, studios, streaming and media networks.'],
  ['T', 'AT&T Inc.', 'Communication Services', 'NYSE', 22.81, 0.18, 164, 1.1, 34, 'Provides wireless and fiber broadband connectivity services.'],
  ['VZ', 'Verizon Communications Inc.', 'Communication Services', 'NYSE', 41.62, -0.12, 175, 1.0, 18, 'Offers wireless, broadband and enterprise communications services.'],
  ['CMCSA', 'Comcast Corporation', 'Communication Services', 'NASDAQ', 39.44, -0.88, 151, 1.4, 21, 'Operates Xfinity broadband, NBCUniversal and Sky.'],
  ['SPOT', 'Spotify Technology S.A.', 'Communication Services', 'NYSE', 452.83, 1.67, 91, 2.6, 1.9, 'Audio streaming platform for music, podcasts and audiobooks.'],
  ['TMUS', 'T-Mobile US, Inc.', 'Communication Services', 'NASDAQ', 236.52, 0.52, 275, 1.2, 4.1, 'Wireless network operator offering 5G mobile and home internet.'],
  ['RBLX', 'Roblox Corporation', 'Communication Services', 'NYSE', 54.62, 3.36, 35, 3.5, 7.8, 'Operates an immersive platform for user-created games and experiences.'],
  ['EA', 'Electronic Arts Inc.', 'Communication Services', 'NASDAQ', 146.21, -0.27, 38, 1.4, 2.2, 'Develops and publishes video games including EA SPORTS FC and Madden NFL.'],
  ['SNAP', 'Snap Inc.', 'Communication Services', 'NYSE', 11.34, -2.91, 19, 3.9, 31, 'Develops Snapchat and augmented reality camera products.'],
  ['PINS', 'Pinterest, Inc.', 'Communication Services', 'NYSE', 32.41, 0.84, 22, 2.8, 10, 'Visual discovery platform for ideas and shopping.'],

  // ---------------- Consumer Discretionary ----------------
  ['AMZN', 'Amazon.com, Inc.', 'Consumer Discretionary', 'NASDAQ', 198.42, 1.18, 2090, 2.0, 41, 'E-commerce, Amazon Web Services cloud computing, advertising and devices.'],
  ['TSLA', 'Tesla, Inc.', 'Consumer Discretionary', 'NASDAQ', 248.61, -3.12, 795, 3.8, 96, 'Designs electric vehicles, energy storage and solar products.'],
  ['ABNB', 'Airbnb, Inc.', 'Consumer Discretionary', 'NASDAQ', 136.92, -0.64, 87, 2.5, 4.8, 'Online marketplace for lodging and travel experiences.'],
  ['MCD', 'McDonald\'s Corporation', 'Consumer Discretionary', 'NYSE', 296.38, 0.31, 212, 1.0, 3.3, 'World\'s largest restaurant chain by revenue, mostly franchised.'],
  ['NKE', 'NIKE, Inc.', 'Consumer Discretionary', 'NYSE', 76.84, -1.37, 115, 2.0, 11, 'Designs and markets athletic footwear, apparel and equipment.'],
  ['SBUX', 'Starbucks Corporation', 'Consumer Discretionary', 'NASDAQ', 98.24, 0.72, 111, 1.7, 8.5, 'Global roaster and retailer of specialty coffee.'],
  ['HD', 'The Home Depot, Inc.', 'Consumer Discretionary', 'NYSE', 402.63, 0.44, 399, 1.3, 3.4, 'Largest home-improvement retailer in the United States.'],
  ['LOW', 'Lowe\'s Companies, Inc.', 'Consumer Discretionary', 'NYSE', 262.27, 0.21, 149, 1.4, 2.6, 'Home improvement retailer serving DIY and professional customers.'],
  ['BKNG', 'Booking Holdings Inc.', 'Consumer Discretionary', 'NASDAQ', 4850.21, 0.88, 160, 1.7, 0.3, 'Operates online travel brands Booking.com, Priceline, KAYAK and OpenTable.'],
  ['TGT', 'Target Corporation', 'Consumer Discretionary', 'NYSE', 132.41, -1.92, 61, 1.9, 5.2, 'General merchandise retailer with stores and digital channels across the US.'],
  ['F', 'Ford Motor Company', 'Consumer Discretionary', 'NYSE', 10.62, -0.84, 42, 2.2, 52, 'Manufactures cars, trucks and commercial vehicles including EVs.'],
  ['GM', 'General Motors Company', 'Consumer Discretionary', 'NYSE', 52.14, 0.67, 57, 2.0, 12, 'Automaker producing Chevrolet, GMC, Cadillac and Buick vehicles.'],
  ['CMG', 'Chipotle Mexican Grill, Inc.', 'Consumer Discretionary', 'NYSE', 57.31, 1.04, 78, 1.8, 17, 'Fast-casual restaurant chain serving Mexican-inspired food.'],
  ['LULU', 'lululemon athletica inc.', 'Consumer Discretionary', 'NASDAQ', 312.44, -0.96, 38, 2.4, 1.9, 'Designs technical athletic apparel and accessories.'],
  ['RIVN', 'Rivian Automotive, Inc.', 'Consumer Discretionary', 'NASDAQ', 12.84, -4.21, 13, 4.4, 34, 'Manufactures electric adventure vehicles and commercial vans.'],
  ['LCID', 'Lucid Group, Inc.', 'Consumer Discretionary', 'NASDAQ', 2.84, -2.41, 8.6, 4.8, 42, 'Develops luxury electric vehicles and EV technology.'],
  ['EBAY', 'eBay Inc.', 'Consumer Discretionary', 'NASDAQ', 64.21, 0.36, 31, 1.6, 5.1, 'Global online marketplace connecting buyers and sellers.'],
  ['ROST', 'Ross Stores, Inc.', 'Consumer Discretionary', 'NASDAQ', 148.62, 0.18, 49, 1.4, 2.4, 'Off-price retailer of apparel and home fashions.'],

  // ---------------- Consumer Staples ----------------
  ['WMT', 'Walmart Inc.', 'Consumer Staples', 'NYSE', 84.31, 0.58, 678, 1.1, 15, 'Operates hypermarkets, discount stores, grocery and e-commerce worldwide.'],
  ['COST', 'Costco Wholesale Corporation', 'Consumer Staples', 'NASDAQ', 912.58, 0.27, 405, 1.2, 1.9, 'Membership-only warehouse club retailer.'],
  ['KO', 'The Coca-Cola Company', 'Consumer Staples', 'NYSE', 63.42, -0.19, 273, 0.9, 13, 'Global beverage company producing Coca-Cola and hundreds of other brands.'],
  ['PEP', 'PepsiCo, Inc.', 'Consumer Staples', 'NASDAQ', 152.81, -0.42, 210, 1.0, 6.4, 'Food and beverage company behind Pepsi, Frito-Lay, Gatorade and Quaker.'],
  ['PG', 'The Procter & Gamble Company', 'Consumer Staples', 'NYSE', 168.24, 0.12, 396, 0.9, 6.8, 'Consumer goods company with brands such as Tide, Pampers and Gillette.'],
  ['PM', 'Philip Morris International', 'Consumer Staples', 'NYSE', 128.41, 0.84, 199, 1.2, 5.5, 'International tobacco company transitioning to smoke-free products.'],
  ['MDLZ', 'Mondelez International, Inc.', 'Consumer Staples', 'NASDAQ', 61.24, -0.33, 82, 1.1, 8.1, 'Global snack maker of Oreo, Cadbury and Toblerone.'],
  ['CL', 'Colgate-Palmolive Company', 'Consumer Staples', 'NYSE', 92.63, 0.09, 75, 0.9, 4.6, 'Oral care, personal care, home care and pet nutrition products.'],
  ['KHC', 'The Kraft Heinz Company', 'Consumer Staples', 'NASDAQ', 30.82, -0.71, 37, 1.2, 9.8, 'Packaged food company behind Heinz, Kraft and Oscar Mayer.'],
  ['EL', 'The Estée Lauder Companies', 'Consumer Staples', 'NYSE', 72.41, -1.62, 26, 2.6, 4.3, 'Manufacturer of prestige skin care, makeup and fragrance.'],

  // ---------------- Financials ----------------
  ['JPM', 'JPMorgan Chase & Co.', 'Financials', 'NYSE', 238.62, 0.74, 672, 1.4, 9.1, 'Largest US bank, offering consumer, commercial and investment banking.'],
  ['BAC', 'Bank of America Corporation', 'Financials', 'NYSE', 44.71, 0.92, 343, 1.5, 36, 'Diversified bank serving consumers, businesses and institutions.'],
  ['GS', 'The Goldman Sachs Group, Inc.', 'Financials', 'NYSE', 568.34, 1.26, 178, 1.7, 2.3, 'Global investment banking, securities and asset management firm.'],
  ['MS', 'Morgan Stanley', 'Financials', 'NYSE', 128.42, 0.83, 207, 1.6, 6.4, 'Investment bank and wealth management company.'],
  ['WFC', 'Wells Fargo & Company', 'Financials', 'NYSE', 72.63, 0.57, 242, 1.5, 15, 'Diversified financial services company focused on US banking.'],
  ['C', 'Citigroup Inc.', 'Financials', 'NYSE', 70.21, 1.08, 133, 1.7, 14, 'Global bank providing services to consumers, corporations and institutions.'],
  ['V', 'Visa Inc.', 'Financials', 'NYSE', 312.48, 0.38, 605, 1.1, 6.3, 'Operates the world\'s largest electronic payments network.'],
  ['MA', 'Mastercard Incorporated', 'Financials', 'NYSE', 524.31, 0.46, 482, 1.2, 2.7, 'Global payments technology company connecting consumers and merchants.'],
  ['PYPL', 'PayPal Holdings, Inc.', 'Financials', 'NASDAQ', 79.34, -0.94, 79, 2.2, 13, 'Digital payments platform including PayPal, Venmo and Braintree.'],
  ['AXP', 'American Express Company', 'Financials', 'NYSE', 296.84, 0.61, 209, 1.5, 2.9, 'Card issuer and payments network focused on premium consumers.'],
  ['BRK.B', 'Berkshire Hathaway Inc. Class B', 'Financials', 'NYSE', 468.24, 0.14, 1010, 0.9, 3.6, 'Conglomerate with insurance, railroad, energy and a large equity portfolio.'],
  ['SCHW', 'The Charles Schwab Corporation', 'Financials', 'NYSE', 78.62, 0.48, 141, 1.6, 9.4, 'Brokerage, banking and wealth management services provider.'],
  ['BLK', 'BlackRock, Inc.', 'Financials', 'NYSE', 1012.43, 0.53, 150, 1.4, 0.7, 'World\'s largest asset manager and the sponsor of iShares ETFs.'],
  ['COIN', 'Coinbase Global, Inc.', 'Financials', 'NASDAQ', 268.42, 5.24, 67, 5.0, 11, 'Operates a regulated platform for buying, selling and storing crypto assets.'],
  ['SOFI', 'SoFi Technologies, Inc.', 'Financials', 'NASDAQ', 15.24, 2.83, 16, 3.8, 58, 'Digital personal finance company offering loans, banking and investing.'],
  ['HOOD', 'Robinhood Markets, Inc.', 'Financials', 'NASDAQ', 38.62, 3.71, 34, 4.4, 33, 'Commission-free investing app for stocks, options and crypto.'],
  ['XYZ', 'Block, Inc.', 'Financials', 'NYSE', 74.21, -1.28, 46, 3.0, 8.8, 'Builds Square merchant tools, Cash App and bitcoin products.'],

  // ---------------- Healthcare ----------------
  ['PFE', 'Pfizer Inc.', 'Healthcare', 'NYSE', 26.42, -0.53, 150, 1.4, 38, 'Biopharmaceutical company developing medicines and vaccines.'],
  ['LLY', 'Eli Lilly and Company', 'Healthcare', 'NYSE', 812.64, 1.42, 772, 2.0, 3.4, 'Pharmaceutical company known for diabetes and obesity treatments.'],
  ['JNJ', 'Johnson & Johnson', 'Healthcare', 'NYSE', 152.41, 0.21, 367, 0.9, 7.1, 'Develops pharmaceuticals and medical technology products.'],
  ['UNH', 'UnitedHealth Group Incorporated', 'Healthcare', 'NYSE', 528.33, -1.12, 487, 1.6, 3.9, 'Health insurance and Optum healthcare services provider.'],
  ['MRK', 'Merck & Co., Inc.', 'Healthcare', 'NYSE', 98.62, -0.38, 249, 1.2, 9.4, 'Global pharmaceutical company with oncology and vaccine franchises.'],
  ['ABBV', 'AbbVie Inc.', 'Healthcare', 'NYSE', 178.41, 0.63, 315, 1.3, 6.2, 'Biopharmaceutical company focused on immunology, oncology and neuroscience.'],
  ['TMO', 'Thermo Fisher Scientific Inc.', 'Healthcare', 'NYSE', 512.62, -0.24, 196, 1.4, 1.8, 'Supplies scientific instruments, reagents and lab services.'],
  ['ABT', 'Abbott Laboratories', 'Healthcare', 'NYSE', 128.41, 0.36, 223, 1.1, 5.6, 'Develops medical devices, diagnostics, nutrition and generic medicines.'],
  ['AMGN', 'Amgen Inc.', 'Healthcare', 'NASDAQ', 286.24, -0.71, 154, 1.4, 2.8, 'Biotechnology company developing therapies for serious illnesses.'],
  ['MRNA', 'Moderna, Inc.', 'Healthcare', 'NASDAQ', 38.62, -3.47, 15, 4.2, 11, 'Biotechnology company pioneering messenger RNA medicines and vaccines.'],
  ['GILD', 'Gilead Sciences, Inc.', 'Healthcare', 'NASDAQ', 92.43, 0.49, 115, 1.3, 7.3, 'Biopharmaceutical company focused on HIV, liver disease and oncology.'],
  ['BMY', 'Bristol-Myers Squibb Company', 'Healthcare', 'NYSE', 56.84, 0.27, 115, 1.4, 12, 'Biopharmaceutical company with oncology, immunology and cardiovascular drugs.'],
  ['ISRG', 'Intuitive Surgical, Inc.', 'Healthcare', 'NASDAQ', 548.22, 1.36, 195, 1.8, 1.6, 'Makes da Vinci robotic-assisted surgical systems.'],
  ['CVS', 'CVS Health Corporation', 'Healthcare', 'NYSE', 58.63, -0.92, 74, 1.8, 9.1, 'Pharmacy, health insurance (Aetna) and healthcare services company.'],

  // ---------------- Energy ----------------
  ['XOM', 'Exxon Mobil Corporation', 'Energy', 'NYSE', 112.63, -0.68, 495, 1.4, 15, 'Integrated oil and gas company with upstream, refining and chemicals.'],
  ['CVX', 'Chevron Corporation', 'Energy', 'NYSE', 152.41, -0.52, 273, 1.4, 7.6, 'Integrated energy company producing oil, gas and lower-carbon fuels.'],
  ['COP', 'ConocoPhillips', 'Energy', 'NYSE', 104.82, -1.14, 135, 1.8, 6.4, 'Independent exploration and production company.'],
  ['SLB', 'SLB N.V.', 'Energy', 'NYSE', 41.24, -0.36, 58, 2.0, 11, 'Technology and services provider to the global energy industry.'],
  ['OXY', 'Occidental Petroleum Corporation', 'Energy', 'NYSE', 48.62, -1.48, 46, 2.1, 9.7, 'Oil and gas producer with chemical and carbon capture businesses.'],
  ['EOG', 'EOG Resources, Inc.', 'Energy', 'NYSE', 128.43, -0.21, 72, 1.7, 3.2, 'Crude oil and natural gas exploration and production company.'],

  // ---------------- Industrials ----------------
  ['BA', 'The Boeing Company', 'Industrials', 'NYSE', 172.41, -1.73, 129, 2.4, 8.4, 'Designs and manufactures commercial jetliners, defense and space systems.'],
  ['CAT', 'Caterpillar Inc.', 'Industrials', 'NYSE', 382.63, 0.94, 185, 1.7, 2.6, 'Manufactures construction and mining equipment and engines.'],
  ['GE', 'GE Aerospace', 'Industrials', 'NYSE', 186.42, 1.31, 202, 1.9, 5.1, 'Designs jet engines and aerospace systems for commercial and defense aircraft.'],
  ['HON', 'Honeywell International Inc.', 'Industrials', 'NASDAQ', 218.64, 0.12, 142, 1.2, 3.4, 'Industrial conglomerate in aerospace, automation and building technologies.'],
  ['UPS', 'United Parcel Service, Inc.', 'Industrials', 'NYSE', 128.62, -0.87, 110, 1.6, 4.6, 'Global package delivery and logistics company.'],
  ['LMT', 'Lockheed Martin Corporation', 'Industrials', 'NYSE', 512.43, 0.33, 121, 1.2, 1.3, 'Aerospace and defense contractor building aircraft, missiles and space systems.'],
  ['RTX', 'RTX Corporation', 'Industrials', 'NYSE', 122.84, 0.58, 163, 1.3, 4.8, 'Aerospace and defense company comprising Collins, Pratt & Whitney and Raytheon.'],
  ['DE', 'Deere & Company', 'Industrials', 'NYSE', 412.63, -0.44, 112, 1.6, 1.4, 'Manufactures agricultural, construction and forestry machinery.'],
  ['UNP', 'Union Pacific Corporation', 'Industrials', 'NYSE', 238.42, 0.19, 145, 1.3, 2.7, 'Operates one of the largest freight railroad networks in North America.'],
  ['FDX', 'FedEx Corporation', 'Industrials', 'NYSE', 268.63, -0.62, 66, 1.9, 1.8, 'Provides express transportation, e-commerce and logistics services.'],
  ['DAL', 'Delta Air Lines, Inc.', 'Industrials', 'NYSE', 58.42, 1.72, 38, 2.4, 8.7, 'Major US airline serving passengers and cargo worldwide.'],

  // ---------------- Materials / Utilities / Real Estate ----------------
  ['LIN', 'Linde plc', 'Materials', 'NASDAQ', 452.63, 0.24, 216, 1.1, 1.9, 'Largest industrial gas company by market share and revenue.'],
  ['FCX', 'Freeport-McMoRan Inc.', 'Materials', 'NYSE', 42.84, -1.86, 62, 2.6, 13, 'Mining company producing copper, gold and molybdenum.'],
  ['NEM', 'Newmont Corporation', 'Materials', 'NYSE', 48.63, 1.12, 56, 2.2, 9.1, 'World\'s largest gold mining company.'],
  ['DOW', 'Dow Inc.', 'Materials', 'NYSE', 44.21, -0.93, 31, 1.8, 6.6, 'Materials science company producing plastics, coatings and chemicals.'],
  ['NEE', 'NextEra Energy, Inc.', 'Utilities', 'NYSE', 72.41, 0.47, 149, 1.5, 9.8, 'Largest electric utility holding company and a leader in renewable energy.'],
  ['DUK', 'Duke Energy Corporation', 'Utilities', 'NYSE', 112.62, 0.13, 87, 1.0, 3.2, 'Regulated electric and gas utility serving the Carolinas, Florida and Midwest.'],
  ['SO', 'The Southern Company', 'Utilities', 'NYSE', 86.43, 0.22, 95, 1.0, 4.4, 'Electric and gas utility holding company in the southeastern US.'],
  ['AMT', 'American Tower Corporation', 'Real Estate', 'NYSE', 196.42, -0.58, 92, 1.5, 2.4, 'REIT owning wireless communications and broadcast towers.'],
  ['PLD', 'Prologis, Inc.', 'Real Estate', 'NYSE', 112.84, -0.31, 105, 1.6, 4.1, 'Logistics real estate REIT owning warehouses and distribution centers.'],
  ['O', 'Realty Income Corporation', 'Real Estate', 'NYSE', 56.42, 0.16, 49, 1.1, 5.4, 'Net-lease REIT known for monthly dividends.'],

  // ---------------- ETFs ----------------
  ['SPY', 'SPDR S&P 500 ETF Trust', 'ETF', 'NYSE Arca', 586.42, 0.48, 590, 0.9, 48, 'Tracks the S&P 500 index of large-cap US companies.'],
  ['QQQ', 'Invesco QQQ Trust', 'ETF', 'NASDAQ', 512.63, 0.82, 315, 1.2, 36, 'Tracks the Nasdaq-100 index of large non-financial Nasdaq companies.'],
  ['DIA', 'SPDR Dow Jones Industrial Average ETF', 'ETF', 'NYSE Arca', 432.84, 0.27, 33, 0.9, 3.1, 'Tracks the Dow Jones Industrial Average of 30 blue-chip stocks.'],
  ['IWM', 'iShares Russell 2000 ETF', 'ETF', 'NYSE Arca', 224.63, -0.36, 68, 1.4, 28, 'Tracks the Russell 2000 index of US small-cap stocks.'],
  ['VOO', 'Vanguard S&P 500 ETF', 'ETF', 'NYSE Arca', 538.21, 0.47, 560, 0.9, 5.2, 'Low-cost fund tracking the S&P 500 index.'],
  ['SCHD', 'Schwab US Dividend Equity ETF', 'ETF', 'NYSE Arca', 28.42, 0.11, 68, 0.8, 12, 'Tracks high dividend-yielding US stocks with strong fundamentals.'],
  ['VTI', 'Vanguard Total Stock Market ETF', 'ETF', 'NYSE Arca', 288.62, 0.44, 450, 0.9, 3.4, 'Provides exposure to the entire US equity market.'],
  ['IVV', 'iShares Core S&P 500 ETF', 'ETF', 'NYSE Arca', 590.24, 0.49, 560, 0.9, 4.8, 'Low-cost iShares fund tracking the S&P 500.'],
  ['ARKK', 'ARK Innovation ETF', 'ETF', 'NYSE Arca', 54.82, 2.64, 6.2, 3.1, 14, 'Actively managed fund investing in disruptive innovation companies.'],
  ['XLK', 'Technology Select Sector SPDR Fund', 'ETF', 'NYSE Arca', 232.41, 1.04, 71, 1.4, 5.6, 'Tracks technology companies in the S&P 500.'],
  ['XLF', 'Financial Select Sector SPDR Fund', 'ETF', 'NYSE Arca', 48.63, 0.62, 46, 1.1, 38, 'Tracks financial companies in the S&P 500.'],
  ['XLE', 'Energy Select Sector SPDR Fund', 'ETF', 'NYSE Arca', 92.41, -0.74, 35, 1.5, 15, 'Tracks energy companies in the S&P 500.'],
  ['GLD', 'SPDR Gold Shares', 'ETF', 'NYSE Arca', 248.63, 0.38, 76, 1.0, 7.4, 'Tracks the price of gold bullion.'],
  ['TLT', 'iShares 20+ Year Treasury Bond ETF', 'ETF', 'NASDAQ', 92.84, -0.27, 58, 0.9, 32, 'Holds long-dated US Treasury bonds.'],
  ['VGT', 'Vanguard Information Technology ETF', 'ETF', 'NYSE Arca', 612.42, 0.97, 92, 1.4, 0.6, 'Broad exposure to the US information technology sector.'],
  ['SMH', 'VanEck Semiconductor ETF', 'ETF', 'NASDAQ', 238.63, 1.86, 24, 2.3, 6.4, 'Tracks large US-listed semiconductor companies.'],
];

function buildSeed(row: Row, now: number): StockSeed {
  const [symbol, name, sector, exchange, price, changePercentRaw, mcapB, volPct, avgVolM, description] = row;
  const rand = mulberry32(hashString(`seed:${symbol}`));
  const volatility = volPct / 100;
  const previousClose = roundPrice(price / (1 + changePercentRaw / 100));
  const change = roundPrice(price - previousClose);
  const changePercent = pctChange(previousClose, price);
  const open = roundPrice(previousClose * (1 + (rand() - 0.5) * volatility * 0.6));
  const high = roundPrice(Math.max(price, open) * (1 + rand() * volatility * 0.5));
  const low = roundPrice(Math.min(price, open) * (1 - rand() * volatility * 0.5));
  const avgVolume = avgVolM * 1_000_000;
  const volume = Math.round(avgVolume * (0.45 + rand() * 0.5));

  const days = 90;
  const times = tradingDaysBack(days, now);
  const closes = generateCloses({ symbol, endPrice: previousClose, count: days, volatility, salt: 'seed90' });
  const vols = generateVolumes(symbol, avgVolume, days);
  const history: PricePoint[] = closes.map((p, i) => ({ t: times[i], p }));
  const volumeHistory: VolumePoint[] = vols.map((v, i) => ({ t: times[i], v }));

  return {
    symbol,
    name,
    sector,
    exchange,
    type: sector === 'ETF' ? 'etf' : 'stock',
    price,
    previousClose,
    change,
    changePercent,
    open,
    high,
    low,
    volume,
    marketCap: Math.round(mcapB * 1_000_000_000),
    description,
    volatility,
    history,
    volumeHistory,
    updatedAt: new Date(now).toISOString(),
  };
}

const SEED_TIME = Date.now();

/** Typed static stock & ETF seed dataset (120+ symbols). */
export const STOCKS_SEED: StockSeed[] = ROWS.map((r) => buildSeed(r, SEED_TIME));

export const STOCKS_BY_SYMBOL: Record<string, StockSeed> = Object.fromEntries(STOCKS_SEED.map((s) => [s.symbol, s]));

export const SECTORS: Sector[] = Array.from(new Set(STOCKS_SEED.map((s) => s.sector)));

export function getStockSeed(symbol: string): StockSeed | undefined {
  return STOCKS_BY_SYMBOL[symbol.toUpperCase()];
}

/** Average daily volume used by the market simulator. */
export function getAvgVolume(symbol: string): number {
  const row = ROWS.find((r) => r[0] === symbol);
  return row ? row[8] * 1_000_000 : 1_000_000;
}
