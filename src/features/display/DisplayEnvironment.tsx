import { CalendarDays, CloudSun, Clock3, Thermometer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type WeatherState = { temperature: number | null; condition: string };

function describeWeather(code: number): string {
  if (code === 0) return 'Céu limpo';
  if ([1, 2, 3].includes(code)) return 'Parcialmente nublado';
  if ([45, 48].includes(code)) return 'Neblina';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Garoa';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Chuva';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Neve';
  if ([95, 96, 99].includes(code)) return 'Trovoadas';
  return 'Tempo atual';
}

export function DisplayEnvironment() {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherState>({ temperature: null, condition: 'Aracaju-SE' });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadWeather() {
      try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-10.9472&longitude=-37.0731&current=temperature_2m,weather_code&timezone=America%2FMaceio');
        if (!response.ok) return;
        const data = await response.json() as { current?: { temperature_2m?: number; weather_code?: number } };
        if (!active || !data.current) return;
        setWeather({
          temperature: typeof data.current.temperature_2m === 'number' ? data.current.temperature_2m : null,
          condition: typeof data.current.weather_code === 'number' ? describeWeather(data.current.weather_code) : 'Aracaju-SE',
        });
      } catch {}
    }
    void loadWeather();
    const timer = window.setInterval(() => void loadWeather(), 10 * 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const time = useMemo(() => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', hour: '2-digit', minute: '2-digit' }).format(now), [now]);
  const date = useMemo(() => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', weekday: 'short', day: '2-digit', month: 'short' }).format(now).replace(/\.$/, ''), [now]);

  return <div className="display-environment">
    <div className="display-info-primary"><Clock3 size={18} /><strong>{time}</strong></div>
    <div className="display-info-item"><CalendarDays size={16} /><span>{date}</span></div>
    <div className="display-info-item display-weather"><Thermometer size={16} /><strong>{weather.temperature === null ? '--°' : `${Math.round(weather.temperature)}°`}</strong><span>{weather.condition}</span><CloudSun size={16} /></div>
  </div>;
}
