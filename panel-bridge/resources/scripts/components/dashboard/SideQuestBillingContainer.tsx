import * as React from 'react';
import { useEffect, useState } from 'react';
import ContentBox from '@/components/elements/ContentBox';
import Button from '@/components/elements/Button';
import MessageBox from '@/components/MessageBox';
import PageContentBlock from '@/components/elements/PageContentBlock';
import http, { httpErrorToHuman } from '@/api/http';
import tw from 'twin.macro';

interface Subscription {
    game: 'palworld' | 'zomboid';
    plan: string;
    serverId: number | null;
    status: string;
    lifecycleState: string;
    renewalAt: number | null;
    priceCents: number | null;
    currency: string;
    interval: string;
    cancelAtPeriodEnd: boolean;
}

const displayStatus = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const displayPrice = (subscription: Subscription) => subscription.priceCents === null
    ? 'Price unavailable'
    : `${new Intl.NumberFormat(undefined, { style: 'currency', currency: subscription.currency.toUpperCase() }).format(subscription.priceCents / 100)} / ${subscription.interval}`;

export default () => {
    const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
    const [error, setError] = useState('');
    const [openingServerId, setOpeningServerId] = useState<number | null>(null);

    useEffect(() => {
        http.get('/api/sidequest/billing')
            .then(({ data }) => setSubscriptions(data.subscriptions || []))
            .catch((error) => setError(httpErrorToHuman(error)));
    }, []);

    const openPortal = (subscription: Subscription) => {
        if (!subscription.serverId) return;
        setOpeningServerId(subscription.serverId);
        setError('');
        http.post('/api/sidequest/billing/portal', { game: subscription.game, server_id: subscription.serverId })
            .then(({ data }) => window.location.assign(data.url))
            .catch((error) => {
                setError(httpErrorToHuman(error));
                setOpeningServerId(null);
            });
    };

    return (
        <PageContentBlock title={'Billing'}>
            {error && <MessageBox title={'Billing unavailable'} type={'error'}>{error}</MessageBox>}
            {subscriptions === null ? <p>Loading subscriptions...</p> : subscriptions.length === 0 ? (
                <MessageBox title={'No subscriptions'} type={'info'}>There are no SideQuest subscriptions linked to this Panel account.</MessageBox>
            ) : (
                <>
                    {subscriptions.map((subscription) => (
                        <ContentBox key={subscription.serverId || `${subscription.game}-${subscription.plan}`} title={`${subscription.game === 'zomboid' ? 'Project Zomboid' : 'Palworld'}: ${subscription.plan}`} css={tw`mb-4`}>
                            <p css={tw`mb-1`}>Status: {subscription.cancelAtPeriodEnd ? 'Cancels at period end' : displayStatus(subscription.status)}</p>
                            <p css={tw`mb-1`}>Price: {displayPrice(subscription)}</p>
                            {subscription.renewalAt && <p css={tw`mb-0`}>{subscription.cancelAtPeriodEnd ? 'Service ends' : 'Next renewal'}: {new Date(subscription.renewalAt * 1000).toLocaleString()}</p>}
                            <Button type={'button'} onClick={() => openPortal(subscription)} disabled={openingServerId !== null || !subscription.serverId} css={tw`mt-4`}>
                                {openingServerId === subscription.serverId ? 'Opening subscription portal...' : 'Manage Subscription'}
                            </Button>
                        </ContentBox>
                    ))}
                </>
            )}
        </PageContentBlock>
    );
};
