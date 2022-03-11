import React, { useState, useRef } from "react";
import { Container, Text, Flex, Heading, Card, Box, Button, Badge } from "theme-ui";

import { Decimal, LiquityStoreState } from "@liquity/lib-base";
import { useLiquitySelector } from "@liquity/lib-react";

import { useLiquity } from "../hooks/LiquityContext";
import { shortenAddress } from "../utils/shortenAddress";

const select = ({ accountBalance, lusdBalance, lqtyBalance }: LiquityStoreState) => ({
    accountBalance,
    lusdBalance,
    lqtyBalance
});

type token = {
    symbol: string,
    balance: Decimal,
}


const UserModal: React.FC = () => {
    const { account } = useLiquity();
    const { accountBalance, lusdBalance, lqtyBalance } = useLiquitySelector(select);

    const tokens: token[] = [
        { symbol: "AUT", balance: accountBalance },
        { symbol: "LUSD", balance: lusdBalance },
        { symbol: "LQTY", balance: lqtyBalance },
    ];

    return (
        <>
            <Card variant="userAccountModal" sx={{justifyContent: "center"}}>
            <Heading sx={{fontSize: 2 }}>Account</Heading>
                <Flex sx={{ mx: 3, my: 3 }}>
                    <Badge variant="muted" sx={{px: 3}}>
                        <Text>
                            {account}
                        </Text>
                    </Badge>
                </Flex>
                <Flex sx={{
                    justifyContent: "flex-end",
                    mt: 3,
                    mb: 1,
                    p: 2,
                    borderRadius: 16,
                    border: 1,
                    borderColor: "muted",
                    flexDirection: "column",
                }}>
                    {
                        tokens.map((token, i) => (
                            <Flex key={i} sx={{ alignItems: "center", justifyContent: "space-between", my: 1 }}>
                                <Button variant="token" sx={{ p: 0, px: 2, mx: 2, fontSize: 1 }}>{token.symbol}</Button>
                                <Text sx={{ fontSize: 2 }}>{token.balance.prettify()}</Text>
                            </Flex>
                        ))}
                </Flex>
            </Card>
        </>
    );
};
export const UserAccount: React.FC = () => {
    const { account } = useLiquity();
    const userModalOverlayRef = useRef<HTMLDivElement>(null);
    const [userModalOpen, setSystemStatsOpen] = useState(false);
    return (
        <>
            <Box sx={{ display: ["none", "flex"] }}>
                <Flex sx={{ mx: 2, alignItems: "center" }}>
                    {/* <Icon name="user-circle" size="lg" /> */}
                    <Button
                        onClick={() => setSystemStatsOpen(!userModalOpen)}
                        variant="colors"
                        sx={{px: 3, py: 2}}>
                        <Flex sx={{ flexDirection: "column" }}>
                            <Text as="span" sx={{ fontSize: 1 }}>
                                {shortenAddress(account)}
                            </Text>
                        </Flex>
                    </Button>
                </Flex>
            </Box>

            {userModalOpen && (
                <Container
                    variant="modalOverlay"
                    sx={{
                        display: ["none", "flex"],
                        bg: "rgba(0, 0, 0, 0.6)",
                    }}
                    ref={userModalOverlayRef}
                    onClick={e => {
                        if (e.target === userModalOverlayRef.current) {
                            setSystemStatsOpen(false);
                        }
                    }}
                >
                    <UserModal />
                </Container>
            )}
        </>
    )
};

