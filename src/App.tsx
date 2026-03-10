import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Target, 
  TrendingUp, 
  Mail, 
  FileText, 
  Plus, 
  Search, 
  Download, 
  Send, 
  CheckCircle, 
  Loader2,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Check,
  Edit3,
  RefreshCw,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { GoogleGenAI } from "@google/genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  Legend,
  Cell
} from 'recharts';

interface Product {
  id?: number;
  name: string;
  category: string;
  price: number;
  features: string;
  discount: number;
  link: string;
}

interface Customer {
  id?: number;
  name: string;
  email: string;
  buying_behavior: string;
}

const model = new ChatGoogleGenerativeAI({
  model: "gemini-3-flash-preview",
  apiKey: process.env.GEMINI_API_KEY!,
});

// --- UTILITIES ---

const parseJSONResponse = (text: string) => {
  const cleanText = text.trim();
  
  // 1. Try simple parse first
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    // 2. Try to extract from markdown code blocks
    const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (innerE) {
        // Fall through
      }
    }

    // 3. Try to find the first valid JSON object or array
    // We try to find the largest possible JSON block first, then shrink if it fails
    const findJson = (str: string, startChar: string, endChar: string) => {
      let start = str.indexOf(startChar);
      if (start === -1) return null;
      
      let end = str.lastIndexOf(endChar);
      if (end === -1 || end <= start) return null;
      
      // Try greedy first
      try {
        return JSON.parse(str.substring(start, end + 1));
      } catch (err) {
        // If greedy fails, try to find the first matching pair (non-greedy)
        // This is a simple depth-based approach
        let depth = 0;
        for (let i = start; i < str.length; i++) {
          if (str[i] === startChar) depth++;
          else if (str[i] === endChar) depth--;
          
          if (depth === 0) {
            try {
              return JSON.parse(str.substring(start, i + 1));
            } catch (innerErr) {
              // Continue searching
            }
          }
        }
      }
      return null;
    };

    const objectResult = findJson(cleanText, '{', '}');
    if (objectResult) return objectResult;
    
    const arrayResult = findJson(cleanText, '[', ']');
    if (arrayResult) return arrayResult;
    
    throw new Error("No valid JSON object or array found in response");
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentStep, setAgentStep] = useState<string>('');
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchCustomers();
    fetchCompetitors();
    fetchScans();

    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }

    const interval = setInterval(() => {
      fetchProducts();
      fetchCustomers();
      fetchCompetitors();
      fetchScans();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const fetchScans = async () => {
    try {
      const res = await fetch('/api/scans');
      const data = await res.json();
      setScans(data);
    } catch (err) {
      console.error('Failed to fetch scans:', err);
    }
  };

  const fetchProducts = async () => {
    const res = await fetch('/api/products');
    const data = await res.json();
    setProducts(data);
  };

  const fetchCompetitors = async () => {
    const res = await fetch('/api/competitors');
    const data = await res.json();
    setCompetitors(data);
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      setCustomers(data);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    }
  };

  const addProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const newProduct = {
      name: formData.get('name') as string,
      category: formData.get('category') as string,
      price: parseFloat(formData.get('price') as string),
      features: formData.get('features') as string,
      discount: 0,
      link: ''
    };
    await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProduct),
    });
    fetchProducts();
    form.reset();
    
    // Automatic trigger if competitors are present
    if (competitors.length > 0) {
      startScan(newProduct as Product);
    }
  };

  const addCompetitor = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const newCompetitor = {
      name: formData.get('name') as string,
      url: formData.get('url') as string,
      notes: formData.get('notes') as string
    };
    await fetch('/api/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCompetitor),
    });
    fetchCompetitors();
    form.reset();
  };

  const deleteCompetitor = async (id: number) => {
    await fetch(`/api/competitors/${id}`, { method: 'DELETE' });
    fetchCompetitors();
  };

  const addCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const newCustomer = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      buying_behavior: formData.get('buying_behavior') as string,
    };

    await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCustomer),
    });
    fetchCustomers();
    form.reset();
  };

  const deleteCustomer = async (id: number) => {
    await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    fetchCustomers();
  };

  const [isEditingMarketing, setIsEditingMarketing] = useState(false);
  const [editedMarketing, setEditedMarketing] = useState<any>(null);

  const saveMarketingEdits = () => {
    if (!scanResult || !editedMarketing) return;
    setScanResult({ ...scanResult, marketing: editedMarketing });
    setIsEditingMarketing(false);
  };

  const regenerateMarketing = async () => {
    if (!scanResult) return;
    setAgentStep('Marketing Agent: Regenerating trend-based content...');
    try {
      const marketingPrompt = PromptTemplate.fromTemplate(`
        Generate NEW marketing content based on this strategy and current trends:
        {strategy}
        
        Return ONLY a JSON object:
        {{
          "instagram_caption": "string",
          "hashtags": ["string"],
          "email_content": "string",
          "product_caption": "string",
          "trend_analysis": "string"
        }}
      `);

      const marketingChain = marketingPrompt.pipe(model).pipe(new StringOutputParser());
      const marketingRes = await marketingChain.invoke({ strategy: JSON.stringify(scanResult.strategy) });
      const marketing = parseJSONResponse(marketingRes);
      
      setScanResult({ ...scanResult, marketing });
      setAgentStep('');
    } catch (err) {
      console.error('Regeneration failed:', err);
      setAgentStep('');
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 rounded-xl shadow-xl border border-neutral-100">
          <p className="text-xs font-bold text-neutral-400 uppercase mb-1">{label}</p>
          <p className="text-lg font-bold text-indigo-600">
            {payload[0].name === 'price' ? `$${payload[0].value}` : payload[0].value}
          </p>
          {payload[0].payload.details && (
            <p className="text-[10px] text-neutral-500 mt-2 max-w-[200px] leading-relaxed">
              {payload[0].payload.details}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const chartData = useMemo(() => {
    if (!scanResult) return [];
    const data = [
      { 
        name: 'Our Product', 
        price: products[0]?.price || 0,
        details: 'Your current market position and price point.'
      },
      ...scanResult.scoutData.map((s: any) => ({
        name: s.competitor_name || 'Competitor',
        price: s.product_price || 0,
        details: s.marketing_message || 'No additional details available.'
      }))
    ];
    return data;
  }, [scanResult, products]);

  // --- AGENT ORCHESTRATION WITH LANGCHAIN ---

  const runAgents = async (urls: string[], product: Product, customers: Customer[], currentScanId: string) => {
    try {
      // 1. Scout Agent
      setAgentStep('Scout Agent: Scraping competitor websites...');
      const scrapeRes = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const scrapedData = await scrapeRes.json();
      
      const scoutResults = [];
      const scoutParser = new StringOutputParser();
      const scoutPrompt = PromptTemplate.fromTemplate(`
        Analyze the following scraped text from a competitor's website ({url}) and extract product information.
        
        CRITICAL: If the text indicates an error (e.g., "403 Forbidden", "Access Denied", "Cloudflare", "Reference Error"), return a JSON object with an "error" field explaining the block.
        
        Return ONLY a valid JSON object. No other text.
        {{
          "competitor_name": "string",
          "product_name": "string",
          "product_price": "number or null",
          "discount": "string or null",
          "marketing_message": "string",
          "timestamp": "string",
          "error": "string or null"
        }}
        Do not include any conversational text or explanations.
        Text: {text}
      `);

      const scoutChain = scoutPrompt.pipe(model).pipe(scoutParser);

      for (const item of scrapedData) {
        if (item.error) continue;
        setAgentStep(`Scout Agent: Analyzing ${item.url}...`);
        
        const res = await scoutChain.invoke({
          url: item.url,
          text: item.text
        });
        
        try {
          const parsed = parseJSONResponse(res);
          if (parsed.error) {
            console.warn(`Scout Agent reported error for ${item.url}: ${parsed.error}`);
            continue;
          }
          scoutResults.push(parsed);
        } catch (e) {
          console.error("Failed to parse scout result", e);
        }
      }

      if (scoutResults.length === 0) {
        setAgentStep('Scout Agent: Direct scraping blocked. Switching to Search Intelligence...');
        
        const searchPrompt = PromptTemplate.fromTemplate(`
          Research the following competitors and their products related to "{productName}" in the "{category}" category.
          Competitors: {competitors}
          
          Find their current pricing, key features, and marketing messages.
          Return ONLY a JSON array of objects with this structure:
          [
            {{
              "competitor_name": "string",
              "product_name": "string",
              "product_price": "number or null",
              "discount": "string or null",
              "marketing_message": "string",
              "timestamp": "string"
            }}
          ]
        `);

        // Create a separate model instance with search grounding for the fallback
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const searchRes = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Research the following competitors and their products related to "${product.name}" in the "${product.category}" category.
          Competitors: ${competitors.map(c => c.name).join(', ')}
          
          Find their current pricing, key features, and marketing messages.
          Return ONLY a valid JSON array of objects. No other text.
          [
            {
              "competitor_name": "string",
              "product_name": "string",
              "product_price": "number or null",
              "discount": "string or null",
              "marketing_message": "string",
              "timestamp": "string"
            }
          ]`,
          config: {
            tools: [{ googleSearch: {} }] as any
          }
        });

        const searchResText = searchRes.text;

        try {
          const parsed = parseJSONResponse(searchResText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            scoutResults.push(...parsed);
          }
        } catch (e) {
          console.error("Failed to parse search fallback result", e);
        }
      }

      if (scoutResults.length === 0) {
        throw new Error('All competitor sites were blocked and search intelligence failed. Please check your competitor names.');
      }

      // 2. Analyst Agent
      setAgentStep('Analyst Agent: Analyzing competitor social media & marketing tactics...');
      const analystPrompt = PromptTemplate.fromTemplate(`
        Compare the following competitor data with our product data and provide a deep market analysis.
        Competitor Data: {competitorData}
        Our Product: {productData}
        Target Customer: {customerData}
        
        Provide a structured analysis including:
        - Detailed Pricing Strategy Analysis: Analyze how competitors are pricing their products.
        - Social Media & Marketing Presence: Analyze competitor marketing messaging and perceived social media strategy based on their web presence.
        - Feature comparison.
        - Market trends.
        - Competitor strengths/weaknesses.
        - Specific marketing tactics observed.
      `);

      const analystChain = analystPrompt.pipe(model).pipe(new StringOutputParser());
      const analysis = await analystChain.invoke({
        competitorData: JSON.stringify(scoutResults),
        productData: JSON.stringify(product),
        customerData: JSON.stringify(customers)
      });

      // 3. Strategist Agent
      setAgentStep('Strategist Agent: Generating promotional campaigns & dynamic pricing...');
      const strategyPrompt = PromptTemplate.fromTemplate(`
        Based on the following market analysis, generate a comprehensive sales strategy. 
        You MUST incorporate dynamic pricing logic that reacts to competitor price points and market shifts.
        
        Analysis:
        {analysis}
        
        Return ONLY a JSON object:
        {{
          "strategy": "string",
          "suggested_price": "number",
          "dynamic_pricing_logic": "string",
          "promotion_type": "string",
          "campaign_idea": "string",
          "promotional_campaigns": [
            {{ "title": "string", "description": "string", "benefit": "string" }}
          ],
          "market_trend_data": [
            {{ "month": "Jan", "value": "number", "details": "string" }},
            {{ "month": "Feb", "value": "number", "details": "string" }},
            {{ "month": "Mar", "value": "number", "details": "string" }},
            {{ "month": "Apr", "value": "number", "details": "string" }}
          ]
        }}
      `);

      const strategyChain = strategyPrompt.pipe(model).pipe(new StringOutputParser());
      const strategyRes = await strategyChain.invoke({ analysis });
      const strategy = parseJSONResponse(strategyRes);

      // 4. Marketing Agent
      setAgentStep('Marketing Agent: Creating trend-based content...');
      const marketingPrompt = PromptTemplate.fromTemplate(`
        Generate marketing content based on this strategy and current trends:
        {strategy}
        
        Return ONLY a JSON object:
        {{
          "instagram_caption": "string",
          "hashtags": ["string"],
          "email_content": "string",
          "product_caption": "string",
          "trend_analysis": "string"
        }}
      `);

      const marketingChain = marketingPrompt.pipe(model).pipe(new StringOutputParser());
      const marketingRes = await marketingChain.invoke({ strategy: JSON.stringify(strategy) });
      const marketing = parseJSONResponse(marketingRes);

      // 5. Communication Agent
      setAgentStep('Communication Agent: Sending personalized emails to customers...');
      for (const customer of customers) {
        setAgentStep(`Communication Agent: Sending email to ${customer.name}...`);
        
        const personalPrompt = PromptTemplate.fromTemplate(`
          Personalize the following email for this specific customer:
          Customer Name: {name}
          Buying Behavior: {behavior}
          Email Content Template: {template}
          
          Return ONLY the personalized email body text.
        `);
        
        const personalChain = personalPrompt.pipe(model).pipe(new StringOutputParser());
        const personalizedContent = await personalChain.invoke({
          name: customer.name,
          behavior: customer.buying_behavior,
          template: marketing.email_content
        });

        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: customer.email,
            subject: `Exclusive Offer for ${customer.name}: ${product.name}`,
            content: personalizedContent
          }),
        });
      }

      const finalResults = { scoutData: scoutResults, analysis, strategy, marketing };
      
      setAgentStep('Report Agent: Finalizing report...');
      await fetch('/api/save-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId: currentScanId, results: finalResults }),
      });

      await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId: currentScanId, data: finalResults }),
      });

      setScanResult(finalResults);
      setIsScanning(false);
      setAgentStep('');
    } catch (err) {
      console.error('Agent workflow failed:', err);
      setError('An error occurred during the market scan.');
      setIsScanning(false);
      setAgentStep('');
    }
  };

  const startScan = async (overrideProduct?: Product) => {
    const targetProduct = overrideProduct || products[0];
    if (!targetProduct) {
      alert('Please add at least one product first.');
      return;
    }
    if (competitors.length === 0) {
      alert('Please add competitor URLs first.');
      return;
    }
    if (customers.length === 0) {
      alert('Please add at least one customer first.');
      return;
    }
    setIsScanning(true);
    setError(null);
    setScanResult(null);
    
    const urls = competitors.map(c => c.url);
    
    const initRes = await fetch('/api/scan-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        competitorUrls: urls,
        product: targetProduct,
        customerProfile: customers
      }),
    });
    const { scanId } = await initRes.json();
    setScanId(scanId);

    runAgents(urls, targetProduct, customers, scanId);
  };

  const navItems = [
    { id: 'dashboard', label: 'War Room', icon: LayoutDashboard },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'competitors', label: 'Competitors', icon: Search },
    { id: 'customer', label: 'Customers', icon: Users },
    { id: 'marketing', label: 'Marketing', icon: Target },
    { id: 'email', label: 'Campaigns', icon: Mail },
    { id: 'history', label: 'History', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 flex font-sans text-neutral-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col">
        <div className="p-6 border-b border-neutral-100">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl tracking-tighter">
            <TrendingUp size={28} />
            <span>WAR ROOM</span>
          </div>
          <p className="text-[10px] text-neutral-400 mt-1 uppercase tracking-[0.2em] font-bold">Intelligence Engine</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                  ? 'bg-indigo-50 text-indigo-700 font-medium' 
                  : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800'
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-neutral-100">
          <div className="bg-neutral-900 rounded-2xl p-5 text-white shadow-2xl shadow-indigo-500/20">
            <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest mb-3">System Status</p>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping absolute" />
                <div className="w-2 h-2 bg-emerald-400 rounded-full relative" />
              </div>
              <span className="text-xs font-bold tracking-tight">AGENTS ACTIVE</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {navItems.find(i => i.id === activeTab)?.label}
            </h1>
            <p className="text-neutral-500 mt-1">
              {activeTab === 'dashboard' && 'Monitor market movements and competitor strategies in real-time.'}
              {activeTab === 'products' && 'Manage your product catalog and value propositions.'}
              {activeTab === 'competitors' && 'Track and analyze your market rivals.'}
              {activeTab === 'customer' && 'Define your ideal customer segments and behaviors.'}
              {activeTab === 'marketing' && 'AI-generated content and campaign strategies.'}
              {activeTab === 'email' && 'Automated outreach and customer communication.'}
              {activeTab === 'history' && 'View past market intelligence reports and analysis.'}
            </p>
          </div>
          
          <div className="flex gap-3">
            <button className="p-2 text-neutral-400 hover:text-neutral-600 transition-colors">
              <Search size={20} />
            </button>
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm">
              JD
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Scan Control */}
                <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Target className="text-indigo-600" size={20} />
                    Competitor Tracking
                  </h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                      <p className="text-xs font-bold text-neutral-400 uppercase mb-2">Tracked Competitors</p>
                      <div className="space-y-2">
                        {competitors.length === 0 ? (
                          <p className="text-xs text-neutral-500 italic">No competitors added yet.</p>
                        ) : (
                          competitors.map((c) => (
                            <div key={c.id} className="flex items-center justify-between text-sm">
                              <span className="truncate max-w-[150px] font-medium">{c.name}</span>
                              <span className="text-[10px] text-neutral-400">{new URL(c.url).hostname}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => startScan()}
                      disabled={isScanning || competitors.length === 0}
                      className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                        isScanning || competitors.length === 0
                          ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95'
                      }`}
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />
                          Scanning Market...
                        </>
                      ) : (
                        <>
                          <Search size={20} />
                          Start Market Scan
                        </>
                      )}
                    </button>
                    {isScanning && (
                      <p className="text-[10px] text-center text-indigo-500 font-bold uppercase animate-pulse">
                        {agentStep}
                      </p>
                    )}
                  </div>
                </div>

                {/* Live Insights */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm overflow-hidden relative">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <TrendingUp className="text-emerald-500" size={20} />
                      Market Intelligence Dashboard
                    </h3>
                    {scanResult && (
                      <button 
                        onClick={() => window.open(`/api/report/${scanId}`)}
                        className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"
                      >
                        <Download size={14} />
                        Export PDF
                      </button>
                    )}
                  </div>

                  {!scanResult && !isScanning && (
                    <div className="h-64 flex flex-col items-center justify-center text-neutral-400 border-2 border-dashed border-neutral-100 rounded-xl">
                      <AlertCircle size={40} className="mb-2 opacity-20" />
                      <p className="text-sm">No active scan results. Start a scan to see insights.</p>
                    </div>
                  )}

                  {isScanning && (
                    <div className="h-64 flex flex-col items-center justify-center space-y-4">
                      <div className="flex gap-2">
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                          className="w-3 h-3 bg-indigo-600 rounded-full" 
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                          className="w-3 h-3 bg-indigo-400 rounded-full" 
                        />
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                          className="w-3 h-3 bg-indigo-200 rounded-full" 
                        />
                      </div>
                      <p className="text-sm font-medium text-neutral-600">Agents are analyzing competitor data...</p>
                    </div>
                  )}

                  {scanResult && (
                    <div className="space-y-8">
                      {/* Charts Section */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="h-48">
                          <h4 className="text-xs font-bold text-neutral-400 uppercase mb-4 flex items-center gap-2">
                            <BarChart3 size={14} /> Price Comparison
                          </h4>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                              <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                              <YAxis fontSize={10} tickLine={false} axisLine={false} />
                              <Tooltip content={<CustomTooltip />} />
                              <Bar dataKey="price" radius={[4, 4, 0, 0]}>
                                {chartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#e2e8f0'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="h-48">
                          <h4 className="text-xs font-bold text-neutral-400 uppercase mb-4 flex items-center gap-2">
                            <Activity size={14} /> Market Trend Projection
                          </h4>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={scanResult.strategy.market_trend_data}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                              <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} />
                              <YAxis fontSize={10} tickLine={false} axisLine={false} />
                              <Tooltip content={<CustomTooltip />} />
                              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-indigo-50 rounded-xl">
                          <p className="text-xs font-bold text-indigo-400 uppercase">Suggested Price</p>
                          <p className="text-2xl font-bold text-indigo-700">${scanResult.strategy.suggested_price}</p>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-xl">
                          <p className="text-xs font-bold text-emerald-400 uppercase">Promotion Type</p>
                          <p className="text-2xl font-bold text-emerald-700">{scanResult.strategy.promotion_type}</p>
                        </div>
                      </div>

                      {scanResult.strategy.dynamic_pricing_logic && (
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                          <p className="text-xs font-bold text-amber-600 uppercase mb-1">Dynamic Pricing Logic</p>
                          <p className="text-sm text-amber-800 italic">{scanResult.strategy.dynamic_pricing_logic}</p>
                        </div>
                      )}
                      
                      <div>
                        <h4 className="text-xs font-bold text-neutral-400 uppercase mb-2">Strategic Recommendation</h4>
                        <p className="text-sm text-neutral-700 leading-relaxed bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                          {scanResult.strategy.strategy}
                        </p>
                      </div>

                      {scanResult.strategy.promotional_campaigns && (
                        <div>
                          <h4 className="text-xs font-bold text-neutral-400 uppercase mb-4">Suggested Promotional Campaigns</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {scanResult.strategy.promotional_campaigns.map((camp: any, i: number) => (
                              <div key={i} className="p-4 border border-neutral-100 rounded-2xl hover:border-indigo-200 transition-all bg-white shadow-sm">
                                <p className="font-bold text-sm text-indigo-600 mb-1">{camp.title}</p>
                                <p className="text-xs text-neutral-600 mb-2">{camp.description}</p>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase">
                                  <CheckCircle size={10} /> {camp.benefit}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'competitors' && (
            <motion.div 
              key="competitors"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm sticky top-8">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Plus className="text-indigo-600" size={20} />
                    Add Competitor
                  </h3>
                  <form onSubmit={addCompetitor} className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <label className="text-xs font-bold text-neutral-400 uppercase">Competitor Name</label>
                        <div className="group relative">
                          <AlertCircle size={10} className="text-neutral-300 cursor-help" />
                          <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-neutral-900 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            Enter the brand name of your competitor.
                          </div>
                        </div>
                      </div>
                      <input name="name" required className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <label className="text-xs font-bold text-neutral-400 uppercase">Product URL</label>
                        <div className="group relative">
                          <AlertCircle size={10} className="text-neutral-300 cursor-help" />
                          <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-neutral-900 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            The direct link to their product page for our Scout Agent to analyze.
                          </div>
                        </div>
                      </div>
                      <input name="url" type="url" required className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="https://..." />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-neutral-400 uppercase">Notes</label>
                      <textarea name="notes" className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm h-20" />
                    </div>
                    <button type="submit" className="w-full py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-all active:scale-95">
                      Save Competitor
                    </button>
                  </form>
                </div>
              </div>

              <div className="lg:col-span-2 space-y-4">
                {competitors.map((competitor) => (
                  <div key={competitor.id} className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm flex justify-between items-start">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center text-neutral-400">
                        <ExternalLink size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-lg">{competitor.name}</h4>
                        <a href={competitor.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                          {competitor.url} <ChevronRight size={12} />
                        </a>
                        <p className="text-sm text-neutral-500 mt-2">{competitor.notes}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteCompetitor(competitor.id)}
                      className="text-xs font-bold text-red-500 hover:text-red-700 uppercase tracking-wider"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {competitors.length === 0 && (
                  <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-neutral-100">
                    <p className="text-neutral-400">No competitors tracked yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {activeTab === 'products' && (
            <motion.div 
              key="products"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm sticky top-8">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Plus className="text-indigo-600" size={20} />
                    Add New Product
                  </h3>
                  <form onSubmit={addProduct} className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <label className="text-xs font-bold text-neutral-400 uppercase">Product Name</label>
                        <div className="group relative">
                          <AlertCircle size={10} className="text-neutral-300 cursor-help" />
                          <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-neutral-900 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            The name of your product you want to compare.
                          </div>
                        </div>
                      </div>
                      <input name="name" required className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-neutral-400 uppercase">Category</label>
                        <input name="category" required className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-neutral-400 uppercase">Price ($)</label>
                        <input name="price" type="number" step="0.01" required className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-neutral-400 uppercase">Features (Comma separated)</label>
                      <textarea name="features" className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm h-20" />
                    </div>
                    <button type="submit" className="w-full py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-all active:scale-95">
                      Save Product & Scan
                    </button>
                  </form>
                </div>
              </div>

              <div className="lg:col-span-2 space-y-4">
                {products.map((product) => (
                  <div key={product.id} className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm flex justify-between items-center group hover:border-indigo-200 transition-all">
                    <div className="flex gap-4 items-center">
                      <div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center text-neutral-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                        <Package size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-lg">{product.name}</h4>
                        <p className="text-sm text-neutral-500">{product.category} | ${product.price}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => startScan(product)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                      >
                        <Activity size={16} />
                        Launch Intelligence Campaign
                      </button>
                      <button className="p-2 text-neutral-400 hover:text-neutral-600"><ChevronRight size={20} /></button>
                    </div>
                  </div>
                ))}
                {products.length === 0 && (
                  <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-neutral-100">
                    <p className="text-neutral-400">No products added yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'customer' && (
            <motion.div 
              key="customer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
                <h3 className="text-xl font-bold mb-8 flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                    <Users size={24} />
                  </div>
                  Add New Customer
                </h3>
                <form onSubmit={addCustomer} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        <label className="text-xs font-bold text-neutral-400 uppercase">Full Name</label>
                        <div className="group relative">
                          <AlertCircle size={10} className="text-neutral-300 cursor-help" />
                          <div className="absolute bottom-full left-0 mb-2 w-48 p-2 bg-neutral-900 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            The name of your customer for personalization.
                          </div>
                        </div>
                      </div>
                      <input 
                        name="name"
                        required
                        className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                        placeholder="e.g. John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neutral-400 uppercase">Email Address</label>
                      <input 
                        name="email"
                        type="email"
                        required
                        className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                        placeholder="e.g. john@example.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400 uppercase">Buying Behavior</label>
                    <textarea 
                      name="buying_behavior"
                      required
                      className="w-full p-4 bg-neutral-50 border border-neutral-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all h-24" 
                      placeholder="e.g. Quality-focused, Researches before buying, Uses mobile apps"
                    />
                  </div>
                  <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">
                    Add Customer
                  </button>
                </form>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {customers.map((customer) => (
                  <div key={customer.id} className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg">
                        {customer.name.charAt(0)}
                      </div>
                      <button 
                        onClick={() => deleteCustomer(customer.id!)}
                        className="text-neutral-300 hover:text-red-500 transition-colors"
                      >
                        <Plus size={20} className="rotate-45" />
                      </button>
                    </div>
                    <h4 className="font-bold text-lg">{customer.name}</h4>
                    <p className="text-sm text-neutral-500 mb-4">{customer.email}</p>
                    <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Behavior</p>
                      <p className="text-xs text-neutral-600 line-clamp-2">{customer.buying_behavior}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'marketing' && (
            <motion.div 
              key="marketing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {!scanResult ? (
                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-neutral-100">
                  <AlertCircle size={48} className="mx-auto text-neutral-300 mb-4" />
                  <h3 className="text-lg font-bold text-neutral-800">No Marketing Content Yet</h3>
                  <p className="text-neutral-500 max-w-xs mx-auto mt-2">Run a market scan to generate AI-powered marketing strategies and content.</p>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold tracking-tight">AI Content Studio</h2>
                    <div className="flex gap-2">
                      {isEditingMarketing ? (
                        <>
                          <button 
                            onClick={saveMarketingEdits}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all"
                          >
                            <Check size={16} />
                            Save Changes
                          </button>
                          <button 
                            onClick={() => setIsEditingMarketing(false)}
                            className="flex items-center gap-2 px-4 py-2 bg-neutral-200 text-neutral-700 rounded-xl font-bold text-sm hover:bg-neutral-300 transition-all"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => {
                              setEditedMarketing({ ...scanResult.marketing });
                              setIsEditingMarketing(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 text-neutral-700 rounded-xl font-bold text-sm hover:bg-neutral-50 transition-all"
                          >
                            <Edit3 size={16} />
                            Edit Content
                          </button>
                          <button 
                            onClick={regenerateMarketing}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all"
                          >
                            <RefreshCw size={16} className={isScanning ? 'animate-spin' : ''} />
                            Regenerate All Content
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
                      <h3 className="text-lg font-bold mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-pink-100 text-pink-600 rounded-lg">
                            <Target size={20} />
                          </div>
                          Instagram Strategy
                        </div>
                        <span className="text-[10px] font-bold text-neutral-400 uppercase">Social Agent</span>
                      </h3>
                      <div className="space-y-4">
                        <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-100 group relative">
                          {isEditingMarketing ? (
                            <textarea 
                              value={editedMarketing?.instagram_caption}
                              onChange={(e) => setEditedMarketing({ ...editedMarketing, instagram_caption: e.target.value })}
                              className="w-full bg-transparent border-none outline-none text-sm text-neutral-700 leading-relaxed font-serif italic h-24 resize-none"
                            />
                          ) : (
                            <p className="text-sm text-neutral-700 leading-relaxed font-serif italic">
                              "{scanResult.marketing.instagram_caption}"
                            </p>
                          )}
                          {!isEditingMarketing && (
                            <button 
                              onClick={() => navigator.clipboard.writeText(scanResult.marketing.instagram_caption)}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-2 text-neutral-400 hover:text-indigo-600 transition-all"
                            >
                              <Copy size={14} />
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(isEditingMarketing ? editedMarketing?.hashtags : scanResult.marketing.hashtags).map((tag: string, i: number) => (
                            <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-full flex items-center gap-1">
                              #{tag}
                              {isEditingMarketing && (
                                <button 
                                  onClick={() => {
                                    const newTags = editedMarketing.hashtags.filter((_: any, index: number) => index !== i);
                                    setEditedMarketing({ ...editedMarketing, hashtags: newTags });
                                  }}
                                  className="hover:text-red-500"
                                >
                                  <Plus size={10} className="rotate-45" />
                                </button>
                              )}
                            </span>
                          ))}
                          {isEditingMarketing && (
                            <button 
                              onClick={() => {
                                const tag = prompt('Enter new hashtag:');
                                if (tag) setEditedMarketing({ ...editedMarketing, hashtags: [...editedMarketing.hashtags, tag.replace('#', '')] });
                              }}
                              className="px-3 py-1 border border-dashed border-neutral-300 text-neutral-400 text-xs font-bold rounded-full hover:border-indigo-300 hover:text-indigo-500"
                            >
                              + Add Tag
                            </button>
                          )}
                        </div>

                        {(isEditingMarketing ? editedMarketing?.trend_analysis : scanResult.marketing.trend_analysis) && (
                          <div className="mt-4 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                            <p className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Trend Analysis</p>
                            {isEditingMarketing ? (
                              <textarea 
                                value={editedMarketing?.trend_analysis}
                                onChange={(e) => setEditedMarketing({ ...editedMarketing, trend_analysis: e.target.value })}
                                className="w-full bg-transparent border-none outline-none text-xs text-neutral-600 h-16 resize-none"
                              />
                            ) : (
                              <p className="text-xs text-neutral-600">{scanResult.marketing.trend_analysis}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
                      <h3 className="text-lg font-bold mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            <Mail size={20} />
                          </div>
                          Email Copywriting
                        </div>
                        <span className="text-[10px] font-bold text-neutral-400 uppercase">Copy Agent</span>
                      </h3>
                      <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-100 relative group">
                        {isEditingMarketing ? (
                          <textarea 
                            value={editedMarketing?.email_content}
                            onChange={(e) => setEditedMarketing({ ...editedMarketing, email_content: e.target.value })}
                            className="w-full bg-transparent border-none outline-none text-sm text-neutral-700 whitespace-pre-wrap font-sans h-48 resize-none"
                          />
                        ) : (
                          <pre className="text-sm text-neutral-700 whitespace-pre-wrap font-sans">
                            {scanResult.marketing.email_content}
                          </pre>
                        )}
                        {!isEditingMarketing && (
                          <button 
                            onClick={() => navigator.clipboard.writeText(scanResult.marketing.email_content)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-2 text-neutral-400 hover:text-indigo-600 transition-all"
                          >
                            <Copy size={14} />
                          </button>
                        )}
                      </div>
                      <div className="mt-6 flex gap-3">
                        <button 
                          onClick={() => navigator.clipboard.writeText(isEditingMarketing ? editedMarketing?.email_content : scanResult.marketing.email_content)}
                          className="flex-1 py-3 bg-neutral-900 text-white rounded-xl font-bold text-sm hover:bg-neutral-800 transition-all"
                        >
                          Copy to Clipboard
                        </button>
                        <button 
                          onClick={() => setActiveTab('email')}
                          className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all"
                        >
                          Go to Campaigns
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* New Section: Product Messaging */}
                  <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                      <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                        <Package size={20} />
                      </div>
                      Product Value Proposition
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-100">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase mb-2">Primary Hook</p>
                        <p className="text-sm font-medium text-neutral-800">{scanResult.marketing.product_caption}</p>
                      </div>
                      <div className="md:col-span-2 p-6 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                        <p className="text-[10px] font-bold text-indigo-200 uppercase mb-2">AI Strategic Advice</p>
                        <p className="text-sm leading-relaxed">{scanResult.strategy.strategy}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'email' && (
            <motion.div 
              key="email"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              {scanResult && (
                <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Mail className="text-indigo-600" size={24} />
                      Automated Campaign Content
                    </h3>
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase">
                      Ready to Send
                    </span>
                  </div>
                  <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-100 mb-6">
                    <p className="text-xs font-bold text-neutral-400 uppercase mb-2">Subject: New Update: {products[0]?.name}</p>
                    <pre className="text-sm text-neutral-700 whitespace-pre-wrap font-sans">
                      {scanResult.marketing.email_content}
                    </pre>
                  </div>
                  <button 
                    onClick={async () => {
                      setAgentStep('Communication Agent: Sending personalized emails to all customers...');
                      let successCount = 0;
                      let failCount = 0;
                      for (const customer of customers) {
                        try {
                          const personalPrompt = PromptTemplate.fromTemplate(`
                            Personalize the following email for this specific customer:
                            Customer Name: {name}
                            Buying Behavior: {behavior}
                            Email Content Template: {template}
                            
                            Return ONLY the personalized email body text.
                          `);
                          
                          const personalChain = personalPrompt.pipe(model).pipe(new StringOutputParser());
                          const personalizedContent = await personalChain.invoke({
                            name: customer.name,
                            behavior: customer.buying_behavior,
                            template: scanResult.marketing.email_content
                          });

                          const res = await fetch('/api/send-email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              to: customer.email,
                              subject: `Exclusive Offer for ${customer.name}: ${products[0]?.name}`,
                              content: personalizedContent
                            }),
                          });
                          const result = await res.json();
                          if (result.success) successCount++;
                          else failCount++;
                        } catch (e) {
                          failCount++;
                        }
                      }
                      alert(`Campaign finished! Sent: ${successCount}, Failed: ${failCount}. ${failCount > 0 ? 'Check console for details.' : ''}`);
                      setAgentStep('');
                    }}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    <Send size={20} />
                    Send Personalized Emails to {customers.length} Customers
                  </button>
                </div>
              )}

              <div className="bg-white p-8 rounded-3xl border border-neutral-200 shadow-sm text-center">
                <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Mail size={40} />
                </div>
                <h3 className="text-2xl font-bold mb-2">Email Campaign Manager</h3>
                <p className="text-neutral-500 mb-8">Upload your customer list and send automated marketing emails based on the latest intelligence.</p>
                
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-neutral-100 rounded-2xl p-12 hover:border-indigo-200 transition-all cursor-pointer group">
                    <FileText size={32} className="mx-auto text-neutral-300 group-hover:text-indigo-400 mb-2" />
                    <p className="text-sm font-medium text-neutral-500">Drop CSV or Excel file here</p>
                    <p className="text-xs text-neutral-400 mt-1">Max 5,000 emails per campaign</p>
                  </div>
                  
                  <button className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-neutral-800 transition-all active:scale-95">
                    <Send size={20} />
                    Launch Campaign
                  </button>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
                <h4 className="font-bold mb-4">Recent Campaigns</h4>
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                          <CheckCircle size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold">Summer Launch Promo</p>
                          <p className="text-xs text-neutral-400">Sent to 1,240 customers | 2 days ago</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-indigo-600">24% Open Rate</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 gap-6">
                {scans.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-neutral-100">
                    <Activity size={48} className="mx-auto text-neutral-300 mb-4" />
                    <h3 className="text-lg font-bold text-neutral-800">No History Yet</h3>
                    <p className="text-neutral-500 max-w-xs mx-auto mt-2">Your past market scans and reports will appear here.</p>
                  </div>
                ) : (
                  scans.map((scan) => (
                    <div key={scan.id} className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:border-indigo-200 transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-4 items-center">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${scan.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                            {scan.status === 'completed' ? <CheckCircle size={24} /> : <Loader2 size={24} className="animate-spin" />}
                          </div>
                          <div>
                            <h4 className="font-bold text-lg">Scan: {scan.id}</h4>
                            <p className="text-xs text-neutral-400">{new Date(scan.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {scan.status === 'completed' && (
                            <button 
                              onClick={() => {
                                setScanResult(scan.results);
                                setScanId(scan.id);
                                setActiveTab('dashboard');
                              }}
                              className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all"
                            >
                              View Analysis
                            </button>
                          )}
                          {scan.report_path && (
                            <button 
                              onClick={() => window.open(`/api/report/${scan.id}`)}
                              className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-xl font-bold text-xs hover:bg-neutral-200 transition-all flex items-center gap-2"
                            >
                              <Download size={14} />
                              PDF
                            </button>
                          )}
                          <button 
                            onClick={async () => {
                              if (confirm('Are you sure you want to delete this scan?')) {
                                await fetch(`/api/scans/${scan.id}`, { method: 'DELETE' });
                                fetchScans();
                              }
                            }}
                            className="p-2 text-neutral-300 hover:text-red-500 transition-colors"
                          >
                            <Plus size={20} className="rotate-45" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                          <p className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Product</p>
                          <p className="text-xs font-bold text-neutral-700 truncate">{scan.product_data?.name || 'N/A'}</p>
                        </div>
                        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                          <p className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Competitors</p>
                          <p className="text-xs font-bold text-neutral-700">{scan.competitor_urls?.length || 0} Tracked</p>
                        </div>
                        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                          <p className="text-[10px] font-bold text-neutral-400 uppercase mb-1">Status</p>
                          <p className={`text-xs font-bold uppercase ${scan.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {scan.status}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Onboarding Modal */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-white rounded-[2rem] max-w-2xl w-full overflow-hidden shadow-2xl"
            >
              <div className="bg-indigo-600 p-12 text-white text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-10">
                  <TrendingUp size={400} className="absolute -top-20 -left-20 rotate-12" />
                </div>
                <div className="relative z-10">
                  <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <TrendingUp size={40} />
                  </div>
                  <h2 className="text-4xl font-bold tracking-tighter mb-4">Welcome to War Room</h2>
                  <p className="text-indigo-100 text-lg max-w-md mx-auto leading-relaxed">
                    Your AI-powered multi-agent system for dominating your market.
                  </p>
                </div>
              </div>
              
              <div className="p-12 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-3">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">1</div>
                    <h4 className="font-bold">Add Products</h4>
                    <p className="text-xs text-neutral-500 leading-relaxed">Define your catalog and value propositions.</p>
                  </div>
                  <div className="space-y-3">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">2</div>
                    <h4 className="font-bold">Track Rivals</h4>
                    <p className="text-xs text-neutral-500 leading-relaxed">Add competitor URLs for our Scout Agent to monitor.</p>
                  </div>
                  <div className="space-y-3">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">3</div>
                    <h4 className="font-bold">Launch Scan</h4>
                    <p className="text-xs text-neutral-500 leading-relaxed">Our agents will analyze, strategize, and communicate.</p>
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    setShowOnboarding(false);
                    localStorage.setItem('hasSeenOnboarding', 'true');
                  }}
                  className="w-full py-5 bg-neutral-900 text-white rounded-2xl font-bold text-lg hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-200 active:scale-95"
                >
                  Get Started
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
