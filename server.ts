import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";
import axios from 'axios';
import * as cheerio from 'cheerio';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('warroom.db');

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    status TEXT,
    product_data TEXT,
    customer_profile TEXT,
    competitor_urls TEXT,
    results TEXT,
    report_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    price REAL,
    features TEXT,
    discount REAL,
    link TEXT
  );
  CREATE TABLE IF NOT EXISTS competitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    url TEXT,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    buying_behavior TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cors());

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // --- UTILITY ENDPOINTS ---

  app.post('/api/scrape', async (req, res) => {
    const { urls } = req.body;
    const results = [];
    for (const url of urls) {
      try {
        const response = await axios.get(url, { 
          timeout: 10000,
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
          },
          validateStatus: (status) => status < 500, // Allow 403 to be handled manually if needed
        });

        if (response.status === 403 || response.status === 401) {
          console.warn(`Access denied (403/401) for ${url}`);
          results.push({ url, error: 'Access Denied (Bot Protection)', status: response.status });
          continue;
        }

        const $ = cheerio.load(response.data);
        const title = $('title').text() || url;
        
        // Check for common bot protection strings in the body
        const bodyText = $('body').text();
        if (bodyText.includes('Access Denied') || bodyText.includes('Cloudflare') || bodyText.includes('Reference Error')) {
           results.push({ url, error: 'Blocked by Bot Protection', status: 403 });
           continue;
        }

        const text = bodyText.replace(/\s+/g, ' ').substring(0, 5000);
        results.push({ url, title, text });
      } catch (error) {
        console.error(`Scraping failed for ${url}:`, (error as any).message);
        results.push({ url, error: 'Failed to connect or timeout', details: (error as any).message });
      }
    }
    res.json(results);
  });

  app.post('/api/generate-pdf', async (req, res) => {
    const { scanId, data } = req.body;
    const reportPath = path.join(__dirname, `report_${scanId}.pdf`);
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(reportPath);
    doc.pipe(stream);

    doc.fontSize(25).text('Market Intelligence Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Scan ID: ${scanId}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();

    doc.fontSize(18).text('Market Analysis');
    doc.fontSize(10).text(data.analysis);
    doc.moveDown();

    doc.fontSize(18).text('Sales Strategy');
    doc.fontSize(10).text(`Strategy: ${data.strategy.strategy}`);
    doc.text(`Suggested Price: ${data.strategy.suggested_price}`);
    doc.moveDown();

    doc.fontSize(18).text('Marketing Content');
    doc.fontSize(10).text(`Instagram: ${data.marketing.instagram_caption}`);
    doc.text(`Hashtags: ${data.marketing.hashtags.join(', ')}`);

    doc.end();
    
    stream.on('finish', () => {
      db.prepare('UPDATE scans SET report_path = ? WHERE id = ?').run(reportPath, scanId);
      res.json({ success: true, reportPath });
    });
  });

  app.post('/api/save-results', (req, res) => {
    const { scanId, results } = req.body;
    db.prepare('UPDATE scans SET status = ?, results = ? WHERE id = ?')
      .run('completed', JSON.stringify(results), scanId);
    res.json({ success: true });
  });

  app.post('/api/scan-init', (req, res) => {
    const { competitorUrls, product, customerProfile } = req.body;
    const scanId = Math.random().toString(36).substring(7);
    db.prepare('INSERT INTO scans (id, status, product_data, customer_profile, competitor_urls) VALUES (?, ?, ?, ?, ?)')
      .run(scanId, 'processing', JSON.stringify(product), JSON.stringify(customerProfile), JSON.stringify(competitorUrls));
    res.json({ scanId });
  });

  app.get('/api/products', (req, res) => {
    const products = db.prepare('SELECT * FROM products').all();
    res.json(products);
  });

  app.post('/api/products', (req, res) => {
    const { name, category, price, features, discount, link } = req.body;
    db.prepare('INSERT INTO products (name, category, price, features, discount, link) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, category, price, features, discount, link);
    res.json({ success: true });
  });

  app.get('/api/competitors', (req, res) => {
    const competitors = db.prepare('SELECT * FROM competitors').all();
    res.json(competitors);
  });

  app.post('/api/competitors', (req, res) => {
    const { name, url, notes } = req.body;
    db.prepare('INSERT INTO competitors (name, url, notes) VALUES (?, ?, ?)')
      .run(name, url, notes);
    res.json({ success: true });
  });

  app.delete('/api/competitors/:id', (req, res) => {
    db.prepare('DELETE FROM competitors WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/scans', (req, res) => {
    const scans = db.prepare('SELECT * FROM scans ORDER BY created_at DESC').all();
    res.json(scans.map(scan => ({
      ...scan,
      results: scan.results ? JSON.parse(scan.results) : null,
      product_data: scan.product_data ? JSON.parse(scan.product_data) : null,
      customer_profile: scan.customer_profile ? JSON.parse(scan.customer_profile) : null,
      competitor_urls: scan.competitor_urls ? JSON.parse(scan.competitor_urls) : null,
    })));
  });

  app.delete('/api/scans/:id', (req, res) => {
    db.prepare('DELETE FROM scans WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/send-email', async (req, res) => {
    const { to, subject, content } = req.body;
    
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    try {
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[SIMULATED EMAIL - NO CREDENTIALS] To: ${to}, Subject: ${subject}`);
        return res.status(400).json({ 
          success: false, 
          message: 'Email credentials not configured. Please set EMAIL_USER and EMAIL_PASS in environment variables.' 
        });
      }

      await transporter.sendMail({
        from: `"War Room Intelligence" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text: content,
        html: content.replace(/\n/g, '<br>'),
      });

      res.json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
      console.error('Email sending failed:', error);
      res.status(500).json({ success: false, message: 'Failed to send email', error: (error as Error).message });
    }
  });

  app.get('/api/customers', (req, res) => {
    const customers = db.prepare('SELECT * FROM customers').all();
    res.json(customers);
  });

  app.post('/api/customers', (req, res) => {
    const { name, email, buying_behavior } = req.body;
    db.prepare('INSERT INTO customers (name, email, buying_behavior) VALUES (?, ?, ?)')
      .run(name, email, buying_behavior);
    res.json({ success: true });
  });

  app.delete('/api/customers/:id', (req, res) => {
    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/scan/:id', (req, res) => {
    const scan = db.prepare('SELECT * FROM scans WHERE id = ?').get(req.params.id);
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    res.json({
      ...scan,
      results: scan.results ? JSON.parse(scan.results) : null
    });
  });

  app.get('/api/report/:id', (req, res) => {
    const scan = db.prepare('SELECT report_path FROM scans WHERE id = ?').get(req.params.id);
    if (!scan || !scan.report_path) return res.status(404).json({ error: 'Report not found' });
    res.download(scan.report_path);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist/index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
