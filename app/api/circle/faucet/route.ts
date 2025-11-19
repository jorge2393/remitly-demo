import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();

    if (!address) {
      return NextResponse.json(
        { error: 'address is required' },
        { status: 400 }
      );
    }

    const crossmintApiKey = process.env.CROSSMINT_FAUCET_API_KEY;
    if (!crossmintApiKey) {
      return NextResponse.json(
        { error: 'CROSSMINT_FAUCET_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // Use wallet address as wallet locator
    const walletLocator = address;
    const requestBody = {
      amount: 100,
      token: "usdxm",
      chain: "base-sepolia",
    };

    const apiUrl = `https://staging.crossmint.com/api/v1-alpha2/wallets/${walletLocator}/balances`;

    // Log the payload being sent
    console.log('Crossmint Faucet Request:', {
      url: apiUrl,
      payload: requestBody,
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'X-API-KEY': crossmintApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    let responseData: any = null;
    const contentType = response.headers.get('content-type');
    const responseText = await response.text();

    if (responseText && contentType?.includes('application/json')) {
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        // Failed to parse JSON response
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        { 
          error: responseData?.message || responseData?.error || `Failed to request faucet drip (${response.status})` 
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      data: responseData || { message: 'Faucet drip requested successfully' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to request faucet drip' },
      { status: 500 }
    );
  }
}

