import { useState, useEffect, useCallback } from 'react';
import { fetchSpill, fetchHindcast, fetchForecast, fetchEnvironment } from '../services/api';

export function useSpill(id: string | null) {
  const [spill, setSpill] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  const fetch = useCallback(() => {
    if (!id) {
      setSpill(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchSpill(id)
      .then((data) => setSpill(data))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { spill, loading, error, refetch: fetch };
}

export function useHindcast(id: string | null) {
  const [hindcast, setHindcast] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const fetch = useCallback(() => {
    if (!id) {
      setHindcast(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    fetchHindcast(id)
      .then((data) => {
        setHindcast(data);
        setNotFound(!data);
      })
      .catch((err) => {
        if (err?.response?.status === 404) {
          setNotFound(true);
          setHindcast(null);
        } else {
          setError(err);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { hindcast, loading, error, notFound, refetch: fetch };
}

export function useForecast(id: string | null) {
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const fetch = useCallback(() => {
    if (!id) {
      setForecast(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    fetchForecast(id)
      .then((data) => {
        setForecast(data);
        setNotFound(!data);
      })
      .catch((err) => {
        if (err?.response?.status === 404) {
          setNotFound(true);
          setForecast(null);
        } else {
          setError(err);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { forecast, loading, error, notFound, refetch: fetch };
}

export function useEnvironment(id: string | null) {
  const [env, setEnv] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  const fetch = useCallback(() => {
    if (!id) {
      setEnv([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchEnvironment(id)
      .then((data) => setEnv(data))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { env, loading, error, refetch: fetch };
}
