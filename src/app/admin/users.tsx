import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { AdminOnly } from '@/components/admin/AdminOnly';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/text-input';
import { useAuth } from '@/hooks/useAuth';
import { useThemePreference } from '@/hooks/useThemePreference';
import { FREE_MONTHLY_EXTRACT_LIMIT } from '@/lib/quotas';
import { confirmAction, showNotice } from '@/lib/confirmAction';
import { adminDeleteUser, fetchAdminPeople, type AdminPerson } from '@/lib/supabase/adminPeople';
import { adminAdjustRecipeCredits } from '@/lib/supabase/profile';

export default function AdminUsersScreen() {
  return (
    <AdminOnly>
      <UsersBody />
    </AdminOnly>
  );
}

function UsersBody() {
  const { user } = useAuth();
  const { colors } = useThemePreference();
  const [people, setPeople] = useState<AdminPerson[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setPeople(await fetchAdminPeople());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load people.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter(
      (person) =>
        person.email?.toLowerCase().includes(needle) || person.id.toLowerCase().includes(needle),
    );
  }, [people, query]);

  async function adjust(person: AdminPerson) {
    const amount = Number.parseInt(amounts[person.id] ?? '', 10);
    if (!Number.isInteger(amount) || amount === 0 || busyId) return;
    setBusyId(person.id);
    try {
      const balance = await adminAdjustRecipeCredits(person.id, amount);
      setPeople((current) =>
        current.map((row) => (row.id === person.id ? { ...row, purchasedCredits: balance } : row)),
      );
      setAmounts((current) => ({ ...current, [person.id]: '' }));
      await showNotice('Credits updated', `${person.email ?? 'This account'} now has ${balance} purchased credits.`);
    } catch (err) {
      await showNotice('Couldn’t update credits', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(person: AdminPerson) {
    if (busyId || person.id === user?.id) return;
    const confirmed = await confirmAction(
      'Delete this account?',
      `${person.email ?? person.id} and their recipes will be removed. This cannot be undone.`,
      'Delete',
      'Cancel',
    );
    if (!confirmed) return;
    setBusyId(person.id);
    try {
      await adminDeleteUser(person.id);
      setPeople((current) => current.filter((row) => row.id !== person.id));
    } catch (err) {
      await showNotice('Couldn’t delete account', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen dense>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48, paddingHorizontal: 16 }}>
        <Text className="mb-1 mt-2 text-2xl font-bold" style={{ color: colors.text }}>
          People
        </Text>
        <Text className="mb-4 text-sm" style={{ color: colors.textSecondary }}>
          {people.length} accounts. Purchased credits never expire. Free extracts reset monthly ({FREE_MONTHLY_EXTRACT_LIMIT} each).
        </Text>
        <TextInput
          className="mb-4 rounded-[14px] px-3 py-2 text-sm"
          style={{
            color: colors.text,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.frostedBorder,
          }}
          placeholder="Search email"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {error ? (
          <Text className="mb-4 text-sm" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          visible.map((person) => (
            <View
              key={person.id}
              className="mb-3 rounded-[22px] p-4"
              style={{ backgroundColor: colors.frosted, borderWidth: 1, borderColor: colors.frostedBorder }}
            >
              <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                {person.email ?? 'No email'}
                {person.isAdmin ? ' · admin' : ''}
                {person.id === user?.id ? ' · you' : ''}
              </Text>
              <Text className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
                {person.plan} · {person.purchasedCredits} purchased · {person.freeExtractsUsed} free used this month
              </Text>
              <Text className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
                Joined {fmtWhen(person.joinedAt)}
              </Text>
              <View className="mt-3 flex-row items-center gap-2">
                <TextInput
                  className="min-w-0 flex-1 rounded-[14px] px-3 py-2 text-sm"
                  style={{
                    color: colors.text,
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.frostedBorder,
                  }}
                  placeholder="+10 or -5"
                  placeholderTextColor={colors.textSecondary}
                  value={amounts[person.id] ?? ''}
                  onChangeText={(value) => setAmounts((current) => ({ ...current, [person.id]: value }))}
                  keyboardType="numbers-and-punctuation"
                />
                <Pressable
                  className="rounded-[14px] px-3 py-2"
                  style={{ backgroundColor: colors.primary, opacity: busyId === person.id ? 0.6 : 1 }}
                  onPress={() => void adjust(person)}
                  disabled={busyId === person.id}
                >
                  <Text className="text-xs font-bold text-white">Apply</Text>
                </Pressable>
              </View>
              {person.id === user?.id ? null : (
                <Pressable className="mt-3 self-start" onPress={() => void remove(person)} disabled={busyId === person.id}>
                  <Text className="text-xs font-semibold" style={{ color: colors.warning }}>
                    Delete account
                  </Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
