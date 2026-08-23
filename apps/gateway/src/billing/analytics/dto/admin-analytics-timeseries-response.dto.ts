import { Expose, Type } from 'class-transformer';

export class AdminAnalyticsTimeseriesPointDto {
  /** YYYY-MM-DD en la zona de la plataforma (ver `timezone` de la respuesta). */
  @Expose()
  date: string;

  @Expose()
  executions: number;

  @Expose()
  costUSD: number;

  @Expose()
  creditsCharged: number;
}

export class AdminAnalyticsTimeseriesResponseDto {
  @Expose()
  period: string;

  /** Zona fija de la plataforma ('America/Mexico_City'), ver nota en `AdminAnalyticsOverviewResponseDto`. */
  @Expose()
  timezone: string;

  /** Un punto por día del rango, con 0 en los días sin actividad — sin huecos en el eje. */
  @Expose()
  @Type(() => AdminAnalyticsTimeseriesPointDto)
  points: AdminAnalyticsTimeseriesPointDto[];
}
