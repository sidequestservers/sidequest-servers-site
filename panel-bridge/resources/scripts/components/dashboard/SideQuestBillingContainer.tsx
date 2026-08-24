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
    status: string;
    lifecycleState: string;
    renewalAt: number | null;
}

export default () => {
    const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
    const [error, setError] = useState('');
    const [opening, setOpening] = useState(false);

    useEffect(() => {
        http.get('/api/sidequest/billing')
            .then(({ data }) => setSubscriptions(data.subscriptions || []))
            .catch((error) => setError(httpErrorToHuman(error)));
    }, []);

    const openPortal = () => {
        setOpening(true);
        setError('');
        http.post('/api/sidequest/billing/portal')
            .then(({ data }) => window.location.assign(data.url))
            .catch((error) => {
                setError(httpErrorToHuman(error));
                setOpening(false);
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
                        <ContentBox key={`${subscription.game}-${subscription.plan}`} title={`${subscription.game === 'zomboid' ? 'Project Zomboid' : 'Palworld'}: ${subscription.plan}`} css={tw`mb-4`}>
                            <p css={tw`mb-1`}>Status: {subscription.status}</p>
                            {subscription.renewalAt && <p css={tw`mb-0`}>Next renewal: {new Date(subscription.renewalAt * 1000).toLocaleString()}</p>}
                        </ContentBox>
                    ))}
                    <Button type={'button'} onClick={openPortal} disabled={opening}>
                        {opening ? 'Opening subscription portal...' : 'Manage Subscription'}
                    </Button>
                </>
            )}
        </PageContentBlock>
    );
};
