// Firestore pagination utility
import { query, limit, startAfter, getDocs, orderBy } from 'firebase/firestore';

export const getPaginatedData = async (
  collectionRef,
  pageSize = 10,
  lastDoc = null,
  orderByField = 'createdAt',
  orderDirection = 'desc'
) => {
  try {
    let q = query(
      collectionRef,
      orderBy(orderByField, orderDirection),
      limit(pageSize)
    );

    if (lastDoc) {
      q = query(
        collectionRef,
        orderBy(orderByField, orderDirection),
        startAfter(lastDoc),
        limit(pageSize)
      );
    }

    const snapshot = await getDocs(q);
    const data = [];
    let lastVisible = null;

    snapshot.forEach((doc) => {
      data.push({ id: doc.id, ...doc.data() });
      lastVisible = doc;
    });

    return {
      data,
      lastDoc: lastVisible,
      hasMore: snapshot.size === pageSize
    };
  } catch (error) {
    console.error('Error fetching paginated data:', error);
    throw error;
  }
};

