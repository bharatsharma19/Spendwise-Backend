import axios from 'axios';
import { supabase } from '../config/supabase'; // Use admin client for writing rates
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';
import { logger } from '../utils/logger';

interface ExchangeRates {
  [currency: string]: number;
}

export class CurrencyService {
  private static instance: CurrencyService;
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly BASE_CURRENCY = 'USD';
  private readonly API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

  private constructor() {}

  public static getInstance(): CurrencyService {
    if (!CurrencyService.instance) {
      CurrencyService.instance = new CurrencyService();
    }
    return CurrencyService.instance;
  }

  /**
   * Convert amount from one currency to another using USD as base.
   */
  async convert(amount: number, from: string, to: string): Promise<number> {
    if (from === to) return amount;

    try {
      const fromRate = await this.getRate(from);
      const toRate = await this.getRate(to);

      // Convert from -> USD -> to
      // 1 USD = fromRate FROM
      // 1 USD = toRate TO
      // amount FROM / fromRate = amount in USD
      // amount in USD * toRate = amount in TO

      const rate = toRate / fromRate;
      return Number((amount * rate).toFixed(2));
    } catch (error) {
      logger.error(`Currency conversion failed: ${from} to ${to}`, error);
      // Fallback: return original amount (better than crashing, but ideally should warn)
      // Or throw error
      throw new AppError(
        'Currency conversion failed',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.EXTERNAL_SERVICE
      );
    }
  }

  /**
   * Get exchange rate for a currency relative to USD.
   * Checks DB first, if stale/missing fetches new rates from API.
   */
  async getRate(currency: string): Promise<number> {
    if (currency === this.BASE_CURRENCY) return 1;

    const pair = `${this.BASE_CURRENCY}_${currency}`;

    // 1. Check DB
    const { data: cachedRate } = await supabase
      .from('currency_rates')
      .select('*')
      .eq('pair', pair)
      .single();

    if (
      cachedRate &&
      new Date().getTime() - new Date(cachedRate.updated_at).getTime() < this.CACHE_TTL_MS
    ) {
      return Number(cachedRate.rate);
    }

    // 2. Fetch from API if stale or missing
    return this.fetchAndCacheRates(currency);
  }

  /**
   * Fetch latest rates from API and update DB.
   * Returns the rate for the requested currency.
   */
  private async fetchAndCacheRates(targetCurrency: string): Promise<number> {
    try {
      logger.info('Fetching fresh exchange rates from API');
      const response = await axios.get<{ rates: ExchangeRates }>(this.API_URL);
      const rates = response.data.rates;

      // Update specific requested rate in DB (or bulk update if needed)
      // Here we just update the requested one + potentially others if we wanted to be efficient
      // For simplicity, let's update the requested one.

      const rate = rates[targetCurrency];
      if (!rate) {
        throw new Error(`Currency ${targetCurrency} not supported`);
      }

      // Upsert into DB
      const pair = `${this.BASE_CURRENCY}_${targetCurrency}`;
      const { error } = await supabase.from('currency_rates').upsert({
        pair,
        rate,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        logger.error('Failed to cache currency rate', error);
      }

      return rate;
    } catch (error) {
      logger.error('Failed to fetch exchange rates', error);
      throw new AppError(
        'Failed to fetch exchange rates',
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.EXTERNAL_SERVICE
      );
    }
  }
}
