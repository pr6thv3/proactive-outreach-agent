// ─── OBSERVE: Web Scraper Agent ───────────────────────
// Production scraping with ScrapeData persistence, web_reader, retry

import { BaseAgent } from '../base';
import { AgentContext, ObserveOutput, SignalData } from '../types';
import { db } from '@/lib/db';

interface WebScraperInput {
  urls?: string[];
  query?: string;
}

export class WebScraperAgent extends BaseAgent<WebScraperInput, ObserveOutput> {
  readonly name = 'WebScraper';
  readonly phase = 'observe' as const;
  readonly description = 'Scrapes company website and web search for signals';

  async execute(input: WebScraperInput, context: AgentContext): Promise<ObserveOutput> {
    const signals: SignalData[] = [];
    const scrapeResults: ObserveOutput['scrapeResults'] = [];
    const enrichedLead = context.lead;
    const urlsToScrape = [...(input.urls || [])];
    if (enrichedLead.url && !urlsToScrape.includes(enrichedLead.url)) {
      urlsToScrape.push(enrichedLead.url);
    }

    // 1. Scrape company website with web_reader
    for (const url of urlsToScrape) {
      try {
        await this.scrapeCompanyWebsite(url, context.leadId, context.organizationId);
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') console.warn(`[WebScraper] Failed to scrape ${url}:`, error);
      }
    }

    // 2. Web search for company info
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const company = enrichedLead.company || enrichedLead.name;
      const searchQuery = input.query || `${company} news updates hiring funding`;
      const searchResults = await zai.functions.invoke('web_search', {
        query: searchQuery,
        num: 8,
      });

      if (Array.isArray(searchResults)) {
        for (const result of searchResults.slice(0, 5)) {
          const searchTitle = result.name || String((result as { title?: unknown }).title || '');
          scrapeResults.push({
            url: result.url || '',
            title: searchTitle,
            snippets: [result.snippet || ''],
          });

          const snippet = result.snippet || '';
          const extracted = extractSignalsFromText(snippet);
          for (const sig of extracted) {
            const saved = await db.signal.create({
              data: {
                organizationId: context.organizationId,
                type: sig.type,
                content: sig.content,
                source: 'web_scraper_search',
                relevance: sig.relevance,
                confidence: sig.confidence,
                rawSnippet: snippet.slice(0, 500),
                sourceUrl: result.url || null,
                sourceTitle: searchTitle || null,
                leadId: context.leadId,
              },
            });
            signals.push(mapSignal(saved));
          }
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.warn('[WebScraper] Web search failed, creating fallback signal:', error);
      const saved = await db.signal.create({
        data: {
          organizationId: context.organizationId,
          type: 'news',
          content: `Web search unavailable for ${enrichedLead.company || enrichedLead.name}. Manual research recommended.`,
          source: 'web_scraper_fallback',
          relevance: 0.3,
          confidence: 0.3,
          sourceUrl: enrichedLead.url || null,
          sourceTitle: enrichedLead.company || enrichedLead.name,
          leadId: context.leadId,
        },
      });
      signals.push(mapSignal(saved));
    }

    // 3. Update lead status to enriched
    if (signals.length > 0) {
      await db.lead.updateMany({
        where: { id: context.leadId, ...(context.organizationId ? { organizationId: context.organizationId } : {}) },
        data: { status: 'enriched' },
      });
      await db.activity.create({
        data: {
          organizationId: context.organizationId,
          type: 'enriched',
          description: `Lead enriched with ${signals.length} signals from web scraping`,
          phase: 'observe',
          leadId: context.leadId,
          metadata: JSON.stringify({ signalCount: signals.length }),
        },
      });
    }

    return { signals, enrichedLead: { ...enrichedLead, status: 'enriched' }, scrapeResults };
  }

  private async scrapeCompanyWebsite(url: string, leadId: string, organizationId?: string): Promise<void> {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      // Scrape main page
      const mainPage = await zai.functions.invoke('web_reader' as any, { url });
      const mainContent = typeof mainPage === 'object' && mainPage !== null
        ? (mainPage as any)?.html || (mainPage as any)?.content || ''
        : String(mainPage || '');
      const homepageText = extractTextContent(mainContent);
      const homepageTitle = extractTitle(mainContent) || 'Company homepage';

      // Scrape /about
      let aboutText = '';
      try {
        const aboutPage = await zai.functions.invoke('web_reader' as any, { url: `${url.replace(/\/$/, '')}/about` });
        aboutText = extractTextContent(aboutPage);
      } catch { /* about page may not exist */ }

      // Scrape /careers
      let careersText = '';
      try {
        const careersPage = await zai.functions.invoke('web_reader' as any, { url: `${url.replace(/\/$/, '')}/careers` });
        careersText = extractTextContent(careersPage);
      } catch { /* careers page may not exist */ }

      let blogText = '';
      try {
        const blogPage = await zai.functions.invoke('web_reader' as any, { url: `${url.replace(/\/$/, '')}/blog` });
        blogText = extractTextContent(blogPage);
      } catch { /* blog page may not exist */ }

      let newsText = '';
      try {
        const newsPage = await zai.functions.invoke('web_reader' as any, { url: `${url.replace(/\/$/, '')}/news` });
        newsText = extractTextContent(newsPage);
      } catch { /* news page may not exist */ }

      // Save scrape data
      await db.scrapeData.create({
        data: {
          organizationId,
          url,
          pageTitle: homepageTitle || url,
          aboutText: aboutText.slice(0, 5000) || null,
          careersText: careersText.slice(0, 5000) || null,
          blogText: blogText.slice(0, 5000) || null,
          newsText: newsText.slice(0, 5000) || null,
          rawHtml: mainContent.slice(0, 10000) || null,
          status: 'completed',
          scrapedAt: new Date(),
          leadId,
        },
      });

      // Extract signals from the homepage itself so the primary company source can cite evidence.
      if (homepageText) {
        const homepageSignals = extractSignalsFromText(homepageText);
        for (const sig of homepageSignals) {
          await db.signal.create({
            data: {
              organizationId,
              type: sig.type,
              content: sig.content,
              source: 'web_scraper_homepage',
              relevance: sig.relevance,
              confidence: sig.confidence,
              rawSnippet: homepageText.slice(0, 300),
              sourceUrl: url,
              sourceTitle: homepageTitle,
              leadId,
            },
          });
        }
      }

      // Extract signals from about text
      if (aboutText) {
        const aboutSignals = extractSignalsFromText(aboutText);
        for (const sig of aboutSignals) {
          await db.signal.create({
            data: {
              organizationId,
              type: sig.type,
              content: sig.content,
              source: 'web_scraper_about',
              relevance: sig.relevance,
              confidence: sig.confidence,
              rawSnippet: aboutText.slice(0, 300),
              sourceUrl: `${url.replace(/\/$/, '')}/about`,
              sourceTitle: 'Company about page',
              leadId,
            },
          });
        }
      }

      // Extract hiring signals from careers text
      if (careersText) {
        const careerSignals = extractSignalsFromText(careersText);
        for (const sig of careerSignals.filter(s => s.type === 'hiring' || s.type === 'expansion')) {
          await db.signal.create({
            data: {
              organizationId,
              type: sig.type,
              content: sig.content,
              source: 'web_scraper_careers',
              relevance: sig.relevance,
              confidence: sig.confidence,
              rawSnippet: careersText.slice(0, 300),
              sourceUrl: `${url.replace(/\/$/, '')}/careers`,
              sourceTitle: 'Company careers page',
              leadId,
            },
          });
        }
      }

      for (const source of [
        { text: blogText, source: 'web_scraper_blog', path: 'blog', title: 'Company blog' },
        { text: newsText, source: 'web_scraper_news', path: 'news', title: 'Company news page' },
      ]) {
        if (!source.text) continue;
        const sourceSignals = extractSignalsFromText(source.text);
        for (const sig of sourceSignals) {
          await db.signal.create({
            data: {
              organizationId,
              type: sig.type,
              content: sig.content,
              source: source.source,
              relevance: sig.relevance,
              confidence: sig.confidence,
              rawSnippet: source.text.slice(0, 300),
              sourceUrl: `${url.replace(/\/$/, '')}/${source.path}`,
              sourceTitle: source.title,
              leadId,
            },
          });
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown scrape error';
      await db.scrapeData.create({
        data: { organizationId, url, status: 'failed', errorMessage: msg, leadId },
      });
    }
  }
}

function extractTextContent(page: unknown): string {
  if (typeof page === 'string') return page.slice(0, 5000);
  if (typeof page === 'object' && page !== null) {
    const obj = page as Record<string, unknown>;
    return String(obj.html || obj.content || obj.text || '').slice(0, 5000);
  }
  return '';
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractSignalsFromText(text: string): Array<{ type: SignalData['type']; content: string; relevance: number; confidence: number }> {
  const signals: Array<{ type: SignalData['type']; content: string; relevance: number; confidence: number }> = [];
  const lower = text.toLowerCase();

  if (lower.includes('hiring') || lower.includes('looking for') || lower.includes('job opening') || lower.includes('we\'re hiring') || lower.includes('open positions')) {
    signals.push({ type: 'hiring', content: `Hiring signal: ${text.slice(0, 150).replace(/\n/g, ' ')}`, relevance: 0.85, confidence: 0.85 });
  }
  if (lower.includes('raised') || lower.includes('funding') || lower.includes('series a') || lower.includes('series b') || lower.includes('series c')) {
    signals.push({ type: 'funding', content: `Funding signal: ${text.slice(0, 150).replace(/\n/g, ' ')}`, relevance: 0.9, confidence: 0.9 });
  }
  if (lower.includes('growth') || lower.includes('expanding') || lower.includes('scaling') || lower.includes('new office')) {
    signals.push({ type: 'growth', content: `Growth signal: ${text.slice(0, 150).replace(/\n/g, ' ')}`, relevance: 0.8, confidence: 0.8 });
  }
  if (lower.includes('react') || lower.includes('python') || lower.includes('kubernetes') || lower.includes('aws') || lower.includes('node.js') || lower.includes('gcp')) {
    const techWords = ['react', 'python', 'kubernetes', 'aws', 'node.js', 'gcp', 'typescript', 'postgresql', 'redis', 'docker'].filter(t => lower.includes(t));
    signals.push({ type: 'tech_stack', content: `Tech stack clues: ${techWords.join(', ')}`, relevance: 0.7, confidence: 0.75 });
  }
  if (lower.includes('challenge') || lower.includes('problem') || lower.includes('struggle') || lower.includes('difficulty') || lower.includes('bottleneck')) {
    signals.push({ type: 'pain_point', content: `Pain point: ${text.slice(0, 150).replace(/\n/g, ' ')}`, relevance: 0.8, confidence: 0.7 });
  }
  if (lower.includes('appointed') || lower.includes('joined as') || lower.includes('new ceo') || lower.includes('new cto') || lower.includes('promoted to')) {
    signals.push({ type: 'job_change', content: `Leadership change: ${text.slice(0, 150).replace(/\n/g, ' ')}`, relevance: 0.85, confidence: 0.85 });
  }
  if (signals.length === 0 && text.length > 30) {
    signals.push({ type: 'news', content: `Relevant info: ${text.slice(0, 150).replace(/\n/g, ' ')}`, relevance: 0.4, confidence: 0.5 });
  }
  return signals;
}

function mapSignal(s: { id: string; type: string; content: string; source: string; relevance: number; confidence: number; rawSnippet: string | null; sourceUrl?: string | null; sourceTitle?: string | null }): SignalData {
  return { id: s.id, type: s.type as SignalData['type'], content: s.content, source: s.source, relevance: s.relevance, confidence: s.confidence, rawSnippet: s.rawSnippet || undefined, sourceUrl: s.sourceUrl || undefined, sourceTitle: s.sourceTitle || undefined };
}
