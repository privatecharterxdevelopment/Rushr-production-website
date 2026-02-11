import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Haversine formula to calculate distance between two points
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959 // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * GET /api/jobs/available-direct
 * Fetch available direct payment jobs for contractors
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const contractorId = searchParams.get('contractorId')
    const latitude = parseFloat(searchParams.get('latitude') || '0')
    const longitude = parseFloat(searchParams.get('longitude') || '0')
    const radiusMiles = parseFloat(searchParams.get('radius') || '25')

    if (!contractorId) {
      return NextResponse.json(
        { error: 'Missing contractorId' },
        { status: 400 }
      )
    }

    // Get contractor's info for category matching
    const { data: contractor, error: contractorError } = await supabase
      .from('pro_contractors')
      .select('categories, base_zip, service_area_zips, latitude, longitude')
      .eq('id', contractorId)
      .single()

    if (contractorError || !contractor) {
      return NextResponse.json(
        { error: 'Contractor not found' },
        { status: 404 }
      )
    }

    // Use contractor's location if no location provided
    const searchLat = latitude || contractor.latitude || 0
    const searchLng = longitude || contractor.longitude || 0

    // Fetch available direct payment jobs
    const { data: jobs, error: jobsError } = await supabase
      .from('homeowner_jobs')
      .select(`
        id,
        title,
        category,
        description,
        address,
        zip_code,
        latitude,
        longitude,
        final_cost,
        created_at,
        homeowner_id,
        photo_urls
      `)
      .eq('status', 'pending')
      .not('final_cost', 'is', null)
      .order('created_at', { ascending: false })

    if (jobsError) {
      console.error('[AvailableDirect] Error fetching jobs:', jobsError)
      return NextResponse.json(
        { error: 'Failed to fetch jobs' },
        { status: 500 }
      )
    }

    // Filter jobs by distance and category
    const contractorCategories = contractor.categories || []
    const serviceAreaZips = contractor.service_area_zips || []

    const filteredJobs = (jobs || [])
      .map(job => {
        // Calculate distance
        let distance = null
        if (job.latitude && job.longitude && searchLat && searchLng) {
          distance = haversineDistance(searchLat, searchLng, job.latitude, job.longitude)
        }

        return {
          ...job,
          direct_amount: job.final_cost,
          distance: distance ? Math.round(distance * 10) / 10 : null,
          // Mask full address for privacy
          addressPartial: job.address ? job.address.split(',').slice(-2).join(',').trim() : job.zip_code
        }
      })
      .filter(job => {
        // Filter by distance if we have location data
        if (job.distance !== null && job.distance > radiusMiles) {
          return false
        }

        // Filter by ZIP code if no GPS but contractor has service area
        if (job.distance === null && serviceAreaZips.length > 0 && job.zip_code) {
          if (!serviceAreaZips.includes(job.zip_code)) {
            return false
          }
        }

        // Optionally filter by category (contractor categories match job category)
        // For now, show all jobs - contractors can decide if they want them

        return true
      })
      .sort((a, b) => {
        // Sort by distance first, then by creation time
        if (a.distance !== null && b.distance !== null) {
          return a.distance - b.distance
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

    return NextResponse.json({
      success: true,
      jobs: filteredJobs,
      total: filteredJobs.length
    })

  } catch (error: any) {
    console.error('[AvailableDirect] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch available jobs' },
      { status: 500 }
    )
  }
}
